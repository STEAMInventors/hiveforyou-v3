import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorCode, StudyRunStage, StudyRunStatus } from "@hiveforyou/contracts/errors/v1";
import { parsePackExtractionOwnerViewV1 } from "@hiveforyou/contracts/pack-extraction/v1";

const mocks = vi.hoisted(() => ({
  reader: null as unknown,
  extractionFactory: vi.fn(),
  prepareExtractionPlan: vi.fn(),
}));

vi.mock("../reader/reader-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../reader/reader-client.js")>();
  return { ...actual, createReaderClient: vi.fn(() => mocks.reader) };
});

vi.mock("../reasoning/litellm-client.js", () => ({
  createLiteLlmReasoningClient: vi.fn(() => ({})),
}));

vi.mock("../reasoning/litellm-extraction-client.js", () => ({
  createLiteLlmExtractionClient: mocks.extractionFactory,
}));

vi.mock("../packs/load-packs.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../packs/load-packs.js")>();
  return {
    ...actual,
    loadDomainPacksOrThrow: vi.fn((root: string) => actual.loadDomainPacksFromRoot(root).packs),
  };
});

vi.mock("../packs/load-pack-v3-candidate.js", () => ({
  loadIepV3CandidateIfPinned: vi.fn(() => null),
}));

vi.mock("../plan/schema-plan.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../plan/schema-plan.js")>();
  return { ...actual, prepareExtractionPlan: mocks.prepareExtractionPlan };
});

import {
  FakeExtractionStore,
  fakeExtractionClient,
  fakeReader,
  plausibleOutput,
  REPO_ROOT,
  sourceRow,
} from "../pack-extraction/pack-extraction.fixture.js";
import { PlanningError } from "../plan/errors.js";
import { L001_CORPUS } from "../plan/l001-corpus.fixture.js";
import { processStudyRun } from "./process-study-run.js";

const RUN = "run-1";
const HIVE = "hive-1";
const ENV_KEYS = [
  "WORKER_ENABLE_PACK_EXTRACTION",
  "WORKER_ENABLE_QUESTION_PLANNING",
  "DOMAIN_PACKS_ROOT",
  "WORKER_P2_EXTRACTION_LITELLM_ALIAS",
] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

function seed(store: FakeExtractionStore, domainHint: string | null = "iep"): void {
  store.addRun(RUN, HIVE);
  store.contexts.set(RUN, {
    study_run: { id: RUN, hive_id: HIVE, status: StudyRunStatus.QUEUED, stage: StudyRunStage.ENQUEUE, intent_id: "intent-1" },
    owner_user_id: "owner-1",
    intent_request_text: "Summarize services and goals",
    intent_clarification_json: domainHint ? { domain_hint: domainHint } : null,
  });
  store.sources.set(
    RUN,
    L001_CORPUS.map((doc) => sourceRow(doc, HIVE)),
  );
  for (const doc of L001_CORPUS) store.filenames.set(doc.source_document_id, doc.filename);
}

function request() {
  return {
    contract_version: "worker-process-study-run@1" as const,
    study_run_id: RUN,
    hive_id: HIVE,
    correlation_id: "corr-1",
  };
}

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  process.env.WORKER_ENABLE_PACK_EXTRACTION = "1";
  process.env.WORKER_ENABLE_QUESTION_PLANNING = "0";
  process.env.DOMAIN_PACKS_ROOT = `${REPO_ROOT}/domain-packs`;
  process.env.WORKER_P2_EXTRACTION_LITELLM_ALIAS = "worker-p2-extraction";
  mocks.reader = fakeReader();
  mocks.extractionFactory.mockReset();
  mocks.extractionFactory.mockImplementation(() => fakeExtractionClient());
  mocks.prepareExtractionPlan.mockReset();
  mocks.prepareExtractionPlan.mockRejectedValue(
    new PlanningError(ErrorCode.MODEL_OUTPUT_INVALID, "generic path sentinel", { reason: "generic_path" }),
  );
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.restoreAllMocks();
});

describe("processStudyRun — selected IEP Pack path", () => {
  it("runs UI-submitted L001 through Reader, Worker extraction, validation and persistence to SUCCEEDED", async () => {
    const store = new FakeExtractionStore();
    seed(store);

    const result = await processStudyRun(store.client, request());

    expect(result).toMatchObject({ status: StudyRunStatus.SUCCEEDED, idempotent_replay: false });
    expect(mocks.prepareExtractionPlan).not.toHaveBeenCalled();
    expect((mocks.reader as ReturnType<typeof fakeReader>).extractCandidates).not.toHaveBeenCalled();
    expect(store.transitions.map((t) => [t.p_status, t.p_stage])).toEqual([
      [StudyRunStatus.RUNNING, StudyRunStage.LOAD_SOURCES],
      [StudyRunStatus.RUNNING, StudyRunStage.PLAN_SCHEMA],
      [StudyRunStatus.RUNNING, StudyRunStage.EXTRACT],
      [StudyRunStatus.RUNNING, StudyRunStage.VERIFY],
      [StudyRunStatus.SUCCEEDED, StudyRunStage.FINALIZE],
    ]);
    expect(store.transitions[1]).toMatchObject({ p_pack_version: "2.0.0" });
    expect(store.prompts.size).toBe(1);
    expect([...store.artifacts.keys()]).toEqual(
      expect.arrayContaining([`${RUN}|pack-extraction-ref@1|1`]),
    );
    expect(store.batchesFor(RUN)).toHaveLength(8);
    for (const doc of L001_CORPUS) {
      expect(store.pagesForSource(doc.source_document_id)).toHaveLength(doc.pages.length);
    }

    const view = parsePackExtractionOwnerViewV1(store.ownerView(RUN));
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.value.batches.map((b) => b.primary_document_type_id)).toEqual(
      L001_CORPUS.map((doc) => doc.expected_document_type_id),
    );
    for (const batch of view.value.batches) {
      for (const fact of batch.accepted_facts ?? []) {
        if (fact.status === "OBSERVED") expect(fact.evidence.length).toBeGreaterThan(0);
      }
    }

    const acceptedTotal = view.value.batches.reduce(
      (sum, batch) => sum + (batch.accepted_facts?.length ?? 0),
      0,
    );
    expect(store.factVerificationsFor(RUN)).toHaveLength(acceptedTotal);
    expect(store.factVerificationsFor(RUN).every((row) => row.verification_disposition)).toBe(true);
  });

  it("fails closed when a domain hint is present but Pack extraction is disabled", async () => {
    process.env.WORKER_ENABLE_PACK_EXTRACTION = "0";
    const store = new FakeExtractionStore();
    seed(store);
    await expect(processStudyRun(store.client, request())).rejects.toMatchObject({
      name: "ProcessStudyRunError",
      errorCode: ErrorCode.INVALID_REQUEST,
      retryable: false,
    });
    expect(mocks.prepareExtractionPlan).not.toHaveBeenCalled();
    expect(mocks.extractionFactory).not.toHaveBeenCalled();
    expect(store.transitions.at(-1)).toMatchObject({
      p_status: StudyRunStatus.FAILED,
      p_stage: StudyRunStage.PLAN_SCHEMA,
      p_error_code: ErrorCode.INVALID_REQUEST,
    });
  });

  it("keeps the generic path when the flag is off and no domain hint was submitted", async () => {
    process.env.WORKER_ENABLE_PACK_EXTRACTION = "0";
    const store = new FakeExtractionStore();
    seed(store, null);
    await expect(processStudyRun(store.client, request())).rejects.toMatchObject({
      name: "ProcessStudyRunError",
    });
    expect(mocks.prepareExtractionPlan).toHaveBeenCalled();
    expect(mocks.extractionFactory).not.toHaveBeenCalled();
    expect(store.calls.some((fn) => fn.startsWith("hive3_p2px_"))).toBe(false);
  });

  it("keeps the generic path when no reviewed Pack serves the hint", async () => {
    const store = new FakeExtractionStore();
    seed(store, null);
    await expect(processStudyRun(store.client, request())).rejects.toMatchObject({
      name: "ProcessStudyRunError",
    });
    expect(mocks.prepareExtractionPlan).toHaveBeenCalled();
    expect(mocks.extractionFactory).not.toHaveBeenCalled();
  });

  it("does not call a model or fall back when the extraction alias is not configured", async () => {
    mocks.extractionFactory.mockImplementation(() => {
      throw new PlanningError(ErrorCode.DEPENDENCY_UNAVAILABLE, "Extraction alias is not configured.", {
        reason: "alias_not_configured",
      });
    });
    const store = new FakeExtractionStore();
    seed(store);
    await expect(processStudyRun(store.client, request())).rejects.toMatchObject({
      errorCode: ErrorCode.DEPENDENCY_UNAVAILABLE,
      retryable: true,
    });
    expect(store.batchesFor(RUN)).toHaveLength(0);
    expect(store.transitions.some((t) => t.p_status === StudyRunStatus.FAILED)).toBe(false);
  });

  it("fails the run explicitly after saving valid documents when one document is unusable", async () => {
    mocks.extractionFactory.mockImplementation(() =>
      fakeExtractionClient((input, doc) =>
        doc.source_document_id === "l001-03" ? "not an object" : plausibleOutput(input, doc),
      ),
    );
    const store = new FakeExtractionStore();
    seed(store);
    await expect(processStudyRun(store.client, request())).rejects.toMatchObject({
      errorCode: ErrorCode.EXTRACTION_FAILED,
      retryable: false,
      messageSafe: "1 of 8 documents could not be extracted.",
    });
    expect(store.transitions.at(-1)).toMatchObject({
      p_status: StudyRunStatus.FAILED,
      p_stage: StudyRunStage.EXTRACT,
      p_error_code: ErrorCode.EXTRACTION_FAILED,
    });
    const rows = store.batchesFor(RUN);
    expect(rows).toHaveLength(8);
    expect(rows.filter((row) => row.status === "SUCCEEDED")).toHaveLength(7);
  });

  it("returns an idempotent replay for a duplicate delivery after success", async () => {
    const store = new FakeExtractionStore();
    seed(store);
    await processStudyRun(store.client, request());
    store.contexts.set(RUN, {
      ...store.contexts.get(RUN)!,
      study_run: { id: RUN, hive_id: HIVE, status: StudyRunStatus.SUCCEEDED, stage: StudyRunStage.FINALIZE },
    });
    const replay = await processStudyRun(store.client, request());
    expect(replay.idempotent_replay).toBe(true);
    expect(store.batchesFor(RUN)).toHaveLength(8);
  });
});
