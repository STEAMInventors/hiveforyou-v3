import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorCode } from "@hiveforyou/contracts/errors/v1";
import { parsePackExtractionOwnerViewV1 } from "@hiveforyou/contracts/pack-extraction/v1";

import { loadDomainPacksFromRoot } from "../packs/load-packs.js";
import { PlanningError } from "../plan/errors.js";
import { L001_CORPUS, type L001CorpusDocument } from "../plan/l001-corpus.fixture.js";
import type { ReaderClient } from "../reader/reader-client.js";
import {
  FakeExtractionStore,
  fakeExtractionClient,
  fakeReader,
  loadIep200,
  plausibleOutput,
  readResponse,
  REPO_ROOT,
  sourceRow,
  type FakeModelResponder,
} from "./pack-extraction.fixture.js";
import { planPackExtractionWindows } from "./plan-windows.js";
import {
  MAX_EXTRACTION_JSON_BYTES,
  resolvePackExtractionRoute,
  resolveSelectedPack,
  runPackExtractionForSources,
} from "./run-pack-extraction.js";

const { compiled, documentTypeIds } = loadIep200();
const HIVE = "hive-1";
const OTHER_HIVE = "hive-2";

let logLines: string[];

beforeEach(() => {
  logLines = [];
  vi.spyOn(console, "info").mockImplementation((line: string) => void logLines.push(line));
  vi.spyOn(console, "error").mockImplementation((line: string) => void logLines.push(line));
});

afterEach(() => {
  vi.restoreAllMocks();
});

function setup(runId: string, hiveId = HIVE, docs: L001CorpusDocument[] = L001_CORPUS, store = new FakeExtractionStore()) {
  store.addRun(runId, hiveId);
  for (const doc of docs) store.filenames.set(doc.source_document_id, doc.filename);
  return { store, sources: docs.map((doc) => sourceRow(doc, hiveId)) };
}

async function run(input: {
  store: FakeExtractionStore;
  runId: string;
  sources: ReturnType<typeof sourceRow>[];
  responder?: FakeModelResponder;
  extraction?: ReturnType<typeof fakeExtractionClient>;
  budget?: { maxContextTokens: number; outputReserveTokens: number };
  docs?: L001CorpusDocument[];
}) {
  const extraction = input.extraction ?? fakeExtractionClient(input.responder, input.docs);
  const reader = fakeReader(input.docs);
  const result = await runPackExtractionForSources({
    persistence: input.store.client,
    reader: reader as unknown as ReaderClient,
    extraction,
    compiled,
    documentTypeIds,
    domainId: "iep",
    modelAlias: "worker-p2-extraction",
    budget: input.budget ?? { maxContextTokens: 128_000, outputReserveTokens: 8_192 },
    studyRunId: input.runId,
    correlationId: `corr-${input.runId}`,
    ownerUserId: "owner-1",
    sources: input.sources,
  });
  return { result, extraction, reader };
}

describe("runPackExtractionForSources — 8-document synthetic L001", () => {
  it("classifies every document, persists candidates with provenance and projects the owner view", async () => {
    const { store, sources } = setup("run-1");
    const { result, extraction, reader } = await run({ store, runId: "run-1", sources });

    expect(result.unusableDocumentCount).toBe(0);
    expect(result.documents.map((d) => [d.source_document_id, d.document_type_id])).toEqual(
      L001_CORPUS.map((doc) => [doc.source_document_id, doc.expected_document_type_id]),
    );
    expect(extraction.calls).toHaveLength(8);
    expect(new Set(extraction.calls.map((c) => c.systemPrompt))).toEqual(new Set([compiled.system_text]));
    expect(reader.extractCandidates).not.toHaveBeenCalled();

    const rows = store.batchesFor("run-1");
    expect(rows).toHaveLength(8);
    for (const row of rows) {
      expect(row).toMatchObject({
        status: "SUCCEEDED",
        prompt_digest: compiled.prompt_digest,
        pack_id: "iep",
        pack_version: "2.0.0",
        pack_digest: compiled.pack_digest,
        validator_version: "pack-extraction-validator@1",
        cache_status: "NOT_REPORTED",
      });
      expect(row.extraction_json).toBeTruthy();
      expect(String(row.extraction_sha256)).toMatch(/^sha256:[0-9a-f]{64}$/);
    }

    const plan = rows.find((row) => row.source_document_id === "l001-08")!;
    expect(plan.disposition).toBe("VALID_WITH_REJECTIONS");
    expect((plan.validation_json as { rejections: unknown[] }).rejections).toEqual([
      { path: "/records/1/facts/service.delivery", reason_code: "ENUM_INVALID" },
    ]);
    expect(plan.accepted_facts_json).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fact_id: "service.service_type",
          evidence: [{ page_number: 2, exact_quote: "related services" }],
        }),
      ]),
    );

    const view = parsePackExtractionOwnerViewV1(store.ownerView("run-1"));
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.value.batches).toHaveLength(8);
    expect(view.value.batches[7]).toMatchObject({
      filename: "08_initial_iep.pdf",
      primary_document_type_id: "iep.plan",
      rejection_reason_codes: ["ENUM_INVALID"],
      reused: false,
    });
  });

  it("replays committed batches without new model calls (duplicate delivery)", async () => {
    const { store, sources } = setup("run-1");
    await run({ store, runId: "run-1", sources });
    const { extraction } = await run({ store, runId: "run-1", sources });
    expect(extraction.calls).toHaveLength(0);
    expect(store.batchesFor("run-1")).toHaveLength(8);
    expect(logLines.filter((line) => line.includes('"outcome":"replayed"'))).toHaveLength(8);
  });

  it("resumes after a retryable model failure, re-calling only the missing documents", async () => {
    const { store, sources } = setup("run-1");
    let calls = 0;
    const flaky: FakeModelResponder = (input, doc) => {
      calls += 1;
      if (calls === 4) {
        throw new PlanningError(ErrorCode.MODEL_UNAVAILABLE, "Gateway rate limited.", {
          reason: "gateway_status",
          status: 429,
        });
      }
      return plausibleOutput(input, doc);
    };
    const error = await run({ store, runId: "run-1", sources, responder: flaky }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlanningError);
    expect((error as PlanningError).retryable).toBe(true);
    expect(store.batchesFor("run-1")).toHaveLength(3);

    const { extraction, result } = await run({ store, runId: "run-1", sources });
    expect(extraction.calls).toHaveLength(5);
    expect(result.unusableDocumentCount).toBe(0);
    expect(store.batchesFor("run-1")).toHaveLength(8);
  });

  it("reuses a same-Hive extraction in a new run without a model call", async () => {
    const store = new FakeExtractionStore();
    const first = setup("run-1", HIVE, L001_CORPUS, store);
    await run({ store, runId: "run-1", sources: first.sources });
    const second = setup("run-2", HIVE, L001_CORPUS, store);
    const { extraction, result } = await run({ store, runId: "run-2", sources: second.sources });

    expect(extraction.calls).toHaveLength(0);
    expect(result.documents.map((d) => d.document_type_id)).toEqual(
      L001_CORPUS.map((doc) => doc.expected_document_type_id),
    );
    const rows = store.batchesFor("run-2");
    expect(rows).toHaveLength(8);
    expect(rows.every((row) => row.reused_from_batch_id !== null && row.input_tokens === null)).toBe(true);
    const view = parsePackExtractionOwnerViewV1(store.ownerView("run-2"));
    expect(view.ok && view.value.batches.every((b) => b.reused)).toBe(true);
  });

  it("never reuses another Hive's extraction for identical content", async () => {
    const store = new FakeExtractionStore();
    const first = setup("run-1", HIVE, L001_CORPUS, store);
    await run({ store, runId: "run-1", sources: first.sources });
    const other = setup("run-x", OTHER_HIVE, L001_CORPUS, store);
    const { extraction } = await run({ store, runId: "run-x", sources: other.sources });
    expect(extraction.calls).toHaveLength(8);
    expect(store.batchesFor("run-x").every((row) => row.reused_from_batch_id === null)).toBe(true);
  });
});

describe("runPackExtractionForSources — failure dispositions", () => {
  const two = L001_CORPUS.slice(0, 2);

  it("records an unusable document as a FAILED batch and continues with the rest", async () => {
    const { store, sources } = setup("run-1", HIVE, two);
    const responder: FakeModelResponder = (input, doc) =>
      doc.source_document_id === "l001-01" ? { contract_version: "wrong" } : plausibleOutput(input, doc);
    const { result } = await run({ store, runId: "run-1", sources, responder, docs: two });
    expect(result.unusableDocumentCount).toBe(1);
    const [bad, good] = store.batchesFor("run-1");
    expect(bad).toMatchObject({
      status: "FAILED",
      disposition: "UNUSABLE",
      error_code: ErrorCode.MODEL_OUTPUT_INVALID,
      error_reason: "contract_mismatch",
    });
    expect(bad!.extraction_json).toBeNull();
    expect(good).toMatchObject({ status: "SUCCEEDED", disposition: "VALID" });
  });

  it("maps non-retryable gateway failures to safe batch errors", async () => {
    const { store, sources } = setup("run-1", HIVE, two);
    const responder: FakeModelResponder = (input, doc) => {
      if (doc.source_document_id === "l001-01") {
        throw new PlanningError(ErrorCode.MODEL_OUTPUT_INVALID, "Context limit.", {
          reason: "context_limit_rejected",
          alias: "worker-p2-extraction",
        });
      }
      throw new PlanningError(ErrorCode.MODEL_OUTPUT_INVALID, "Invalid JSON.", {
        reason: "message_content_invalid_json",
        message_content_length: 512,
      });
    };
    await run({ store, runId: "run-1", sources, responder, docs: two });
    const [first, second] = store.batchesFor("run-1");
    expect(first).toMatchObject({ error_code: ErrorCode.EXTRACTION_FAILED, error_reason: "context_length_exceeded" });
    expect(second).toMatchObject({
      error_code: ErrorCode.MODEL_OUTPUT_INVALID,
      error_reason: "output_not_json",
      extraction_byte_length: 512,
    });
  });

  it("treats a truncated completion as output_truncated", async () => {
    const { store, sources } = setup("run-1", HIVE, two);
    const extraction = fakeExtractionClient(undefined, two, { finishReason: "length" });
    await run({ store, runId: "run-1", sources, extraction, docs: two });
    expect(store.batchesFor("run-1").map((row) => row.error_reason)).toEqual(["output_truncated", "output_truncated"]);
  });

  it("refuses to store candidate JSON larger than the cap", async () => {
    const one = L001_CORPUS.slice(0, 1);
    const { store, sources } = setup("run-1", HIVE, one);
    const responder: FakeModelResponder = (input, doc) => ({
      ...plausibleOutput(input, doc),
      ambiguities: [{ note: "x".repeat(MAX_EXTRACTION_JSON_BYTES) }],
    });
    const { result } = await run({ store, runId: "run-1", sources, responder, docs: one });
    expect(result.unusableDocumentCount).toBe(1);
    expect(store.batchesFor("run-1")[0]).toMatchObject({
      status: "FAILED",
      error_code: ErrorCode.EXTRACTION_FAILED,
      error_reason: "payload_too_large",
      extraction_json: null,
    });
  });

  it("propagates timeouts as retryable without writing a batch", async () => {
    const one = L001_CORPUS.slice(0, 1);
    const { store, sources } = setup("run-1", HIVE, one);
    const responder: FakeModelResponder = () => {
      throw new PlanningError(ErrorCode.MODEL_TIMEOUT, "Timed out.", { reason: "timeout" });
    };
    await expect(run({ store, runId: "run-1", sources, responder, docs: one })).rejects.toMatchObject({
      errorCode: ErrorCode.MODEL_TIMEOUT,
      retryable: true,
    });
    expect(store.batchesFor("run-1")).toHaveLength(0);
  });

  it("uses Mode B windows when the document exceeds the budget and fails closed when nothing fits", async () => {
    const plan = [L001_CORPUS[7]!];
    const { store, sources } = setup("run-1", HIVE, plan);
    const [whole] = planPackExtractionWindows({
      promptDigest: compiled.prompt_digest,
      promptTokens: 0,
      read: readResponse(plan[0]!, sources[0]!),
      budget: { maxContextTokens: 1_000_000, outputReserveTokens: 0 },
    });
    const tight = {
      maxContextTokens: compiled.estimated_prompt_tokens + 64 + whole!.estimatedInputTokens - 1,
      outputReserveTokens: 64,
    };
    const { extraction, result } = await run({ store, runId: "run-1", sources, budget: tight, docs: plan });
    expect(extraction.calls.length).toBeGreaterThanOrEqual(2);
    expect(store.batchesFor("run-1").map((row) => [row.page_start, row.is_partial])).toEqual([
      [1, true],
      [2, true],
    ]);
    expect(result.documents[0]).toMatchObject({ document_type_id: "iep.plan", window_count: 2 });

    const none = setup("run-2", HIVE, plan, store);
    const noRoom = { maxContextTokens: 1000, outputReserveTokens: 64 };
    const failed = await run({ store, runId: "run-2", sources: none.sources, budget: noRoom, docs: plan });
    expect(failed.extraction.calls).toHaveLength(0);
    expect(failed.result.unusableDocumentCount).toBe(1);
    expect(store.batchesFor("run-2")[0]).toMatchObject({
      status: "FAILED",
      error_reason: "context_budget_exceeded",
    });
  });

  it("logs only identifiers, digests, counts and codes", async () => {
    const { store, sources } = setup("run-1");
    await run({ store, runId: "run-1", sources });
    expect(logLines.length).toBeGreaterThan(0);
    const joined = logLines.join("\n");
    for (const doc of L001_CORPUS) {
      for (const page of doc.pages) {
        for (const line of page.text.split("\n")) {
          expect(joined).not.toContain(line);
        }
      }
      expect(joined).not.toContain(doc.filename);
    }
    expect(joined).not.toContain(compiled.system_text.slice(0, 200));
    expect(joined).not.toContain("related services");
  });
});

describe("resolvePackExtractionRoute", () => {
  const { packs } = loadDomainPacksFromRoot(`${REPO_ROOT}/domain-packs`);
  const enabled = { WORKER_ENABLE_PACK_EXTRACTION: "1" };

  it("uses the generic path when no domain hint was submitted", () => {
    expect(resolvePackExtractionRoute({ packs, domainHint: null, env: enabled })).toEqual({ kind: "generic" });
    expect(resolveSelectedPack({ packs, domainHint: null, env: enabled })).toBeNull();
  });

  it("fails closed when a hint is present but Pack extraction is disabled", () => {
    expect(() => resolvePackExtractionRoute({ packs, domainHint: "iep", env: {} })).toThrowError(
      expect.objectContaining({
        errorCode: ErrorCode.INVALID_REQUEST,
        diagnostics: { reason: "pack_extraction_disabled" },
      }),
    );
  });

  it("selects the reviewed IEP 2.0.0 Pack, never the draft 2.1.0", () => {
    const route = resolvePackExtractionRoute({ packs, domainHint: "iep", env: enabled });
    expect(route.kind).toBe("selected_pack");
    if (route.kind !== "selected_pack") return;
    expect(route.pack.manifest.pack_version).toBe("2.0.0");
    expect(route.pack.domainId).toBe("iep");
  });

  it("fails closed when the hint names no reviewed Pack", () => {
    expect(() => resolvePackExtractionRoute({ packs, domainHint: "grocery", env: enabled })).toThrowError(
      expect.objectContaining({
        errorCode: ErrorCode.INVALID_REQUEST,
        diagnostics: { reason: "pack_not_available" },
      }),
    );
  });

  it("fails closed when the Pack on disk no longer matches its loaded digest", () => {
    const tampered = packs.map((pack) => ({ ...pack, digest: "0".repeat(64) }));
    expect(() =>
      resolvePackExtractionRoute({ packs: tampered, domainHint: "iep", env: enabled }),
    ).toThrowError(
      expect.objectContaining({ errorCode: ErrorCode.INVALID_REQUEST, diagnostics: { reason: "pack_invalid" } }),
    );
  });
});
