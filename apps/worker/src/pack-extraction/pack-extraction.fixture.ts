/** Test-only fakes for the selected-Pack path (IEP 2.0.0, L001 corpus, Gate 2b RPC semantics). */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { vi } from "vitest";

import {
  HIVE_SOURCE_DOCUMENTS_BUCKET,
  READER_DOCUMENT_READ_VERSION,
  type ReaderReadDocumentResponseV1,
} from "@hiveforyou/contracts/reader/v1";
import { normalizeDomainPackManifest, parsePackManifest } from "@hiveforyou/core";

import { computePageSetDigest } from "../persistence/document-pages-persistence.js";
import type { WorkerRegisteredSourceRowV1 } from "../persistence/p15-worker-context.js";
import type { StudyRunPersistenceClient } from "../persistence/study-run-persistence.js";
import { L001_CORPUS, type L001CorpusDocument } from "../plan/l001-corpus.fixture.js";
import type {
  ExtractPackDocumentLiteLlmRequest,
  ExtractPackDocumentLiteLlmResult,
  PackExtractionLiteLlmClient,
} from "../reasoning/litellm-extraction-client.js";
import { compilePackSystemPrompt } from "./compile-system-prompt.js";

export const REPO_ROOT = join(process.cwd(), "../..");
export const IEP_200_PATH = join(REPO_ROOT, "domain-packs/iep/2.0.0/manifest.json");

export function loadIep200() {
  const bytes = readFileSync(IEP_200_PATH, "utf8");
  const manifest = normalizeDomainPackManifest(parsePackManifest(JSON.parse(bytes)));
  const compiled = compilePackSystemPrompt(manifest, { manifestBytes: bytes });
  const documentTypeIds = new Set(manifest.document_types.map((type) => type.document_type_id));
  return { bytes, manifest, compiled, documentTypeIds };
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function sourceRow(doc: L001CorpusDocument, hiveId: string): WorkerRegisteredSourceRowV1 {
  return {
    source_document_id: doc.source_document_id,
    hive_id: hiveId,
    storage_path: `${hiveId}/${doc.source_document_id}.pdf`,
    mime_type: "application/pdf",
    byte_size: 1024,
    sha256: sha256Hex(doc.source_document_id),
    filename: doc.filename,
  };
}

export function readResponse(
  doc: L001CorpusDocument,
  row: WorkerRegisteredSourceRowV1,
): ReaderReadDocumentResponseV1 {
  return {
    contract_version: READER_DOCUMENT_READ_VERSION,
    status: "SUCCEEDED",
    source: { ...row, owner_user_id: "owner-1", storage_bucket: HIVE_SOURCE_DOCUMENTS_BUCKET },
    source_hash_verified: true,
    page_count: doc.pages.length,
    pages: doc.pages.map((page) => ({
      page_number: page.page_number,
      text: page.text,
      extraction_method: "pdf_native",
      quality: { character_count: page.text.length, identity_text_sufficient: true, issues: [] },
    })),
    provenance: { reader_git_sha: "test", reader_version: "test", tools: {}, model_calls: [] },
    read_fingerprint: `sha256:${sha256Hex(`fp-${doc.source_document_id}`)}`,
  };
}

export function fakeReader(docs: L001CorpusDocument[] = L001_CORPUS) {
  const bySource = new Map(docs.map((doc) => [doc.source_document_id, doc]));
  const readDocument = async (input: { source: { source_document_id: string; hive_id: string } }) => {
    const rawId = input.source.source_document_id;
    const baseId = rawId.includes(":") ? rawId.slice(rawId.indexOf(":") + 1) : rawId;
    const doc = bySource.get(rawId) ?? bySource.get(baseId);
    if (!doc) throw new Error("unknown source");
    return readResponse(doc, { ...sourceRow(doc, input.source.hive_id), source_document_id: rawId });
  };
  return {
    readDocument: vi.fn(readDocument),
    extractCandidates: vi.fn(async () => {
      throw new Error("extractCandidates must not be called on the selected-Pack path");
    }),
  };
}

type ModelInput = {
  prompt_digest: string;
  source_ref: { source_sha256: string };
  source_metadata: { window: { page_start: number; page_end: number } };
  pages: Array<{ page_number: number; text: string }>;
};

export function parseModelInput(request: ExtractPackDocumentLiteLlmRequest): ModelInput {
  return JSON.parse(request.userMessageJson) as ModelInput;
}

/** Plausible model answer: classify as the corpus type and cite the first line of each page. */
export function plausibleOutput(input: ModelInput, doc: L001CorpusDocument): Record<string, unknown> {
  const first = input.pages[0]!;
  const titleLine = first.text.split("\n")[0]!;
  const records: Array<Record<string, unknown>> = [
    {
      record_type_id: "document_header",
      record_local_id: "r1",
      segment_index: 0,
      facts: {
        "document_header.title": {
          status: "OBSERVED",
          value: titleLine,
          evidence: [{ page_number: first.page_number, exact_quote: titleLine }],
        },
        "document_header.effective_end": { status: "NOT_FOUND" },
      },
    },
  ];
  if (doc.expected_document_type_id === "iep.plan") {
    const servicePage = input.pages.find((page) => page.text.includes("related services"));
    if (servicePage) {
      records.push({
        record_type_id: "service",
        record_local_id: "r2",
        segment_index: 0,
        facts: {
          "service.service_type": {
            status: "OBSERVED",
            value: "related services",
            evidence: [{ page_number: servicePage.page_number, exact_quote: "related services" }],
          },
          "service.delivery": {
            status: "OBSERVED",
            value: "small_group_daily",
            evidence: [{ page_number: servicePage.page_number, exact_quote: "related services" }],
          },
        },
      });
    }
  }
  return {
    contract_version: "pack-extraction-output@1",
    prompt_digest: input.prompt_digest,
    source_ref_id: "src-1",
    classification: {
      status: "CLASSIFIED",
      primary_document_type_id: doc.expected_document_type_id,
      candidates: [{ document_type_id: doc.expected_document_type_id, confidence: 0.9 }],
    },
    records,
    missing_facts: [],
    ambiguities: [],
  };
}

export type FakeModelResponder = (
  input: ModelInput,
  doc: L001CorpusDocument,
  request: ExtractPackDocumentLiteLlmRequest,
) => unknown | Promise<unknown>;

export function fakeExtractionClient(
  responder: FakeModelResponder = (input, doc) => plausibleOutput(input, doc),
  docs: L001CorpusDocument[] = L001_CORPUS,
  options: { finishReason?: string | null } = {},
): PackExtractionLiteLlmClient & { calls: ExtractPackDocumentLiteLlmRequest[] } {
  const bySha = new Map(docs.map((doc) => [sha256Hex(doc.source_document_id), doc]));
  const calls: ExtractPackDocumentLiteLlmRequest[] = [];
  return {
    calls,
    async extractPackDocument(request): Promise<ExtractPackDocumentLiteLlmResult> {
      calls.push(request);
      const input = parseModelInput(request);
      const doc = bySha.get(input.source_ref.source_sha256);
      if (!doc) throw new Error("unknown document in model input");
      const parsed = await responder(input, doc, request);
      return {
        parsed,
        alias: "worker-p2-extraction",
        durationMs: 12,
        finishReason: options.finishReason === undefined ? "stop" : options.finishReason,
        usage: {
          input_tokens: null,
          output_tokens: null,
          cached_input_tokens: null,
          cache_write_tokens: null,
          cache_status: "NOT_REPORTED",
        },
        providerModel: null,
        gatewayRequestId: null,
        prefixCachingVerified: false,
      };
    },
  };
}

type StoredBatch = Record<string, unknown> & {
  id: string;
  study_run_id: string;
  hive_id: string;
  source_document_id: string;
  prompt_digest: string;
  page_start: number;
};

export type StoredDocumentPage = {
  id: string;
  hive_id: string;
  source_document_id: string;
  first_study_run_id: string | null;
  source_sha256: string;
  read_fingerprint: string;
  page_set_digest: string;
  page_count: number;
  page_number: number;
  page_text: string;
  page_text_sha256: string;
  page_byte_length: number;
  extraction_method: string;
  extraction_status: "SUCCEEDED";
  provenance_json: Record<string, unknown>;
  created_at: string;
};

type Failure = { fn: string; message: string; remaining: number; afterCommit: boolean };

/**
 * In-memory stand-in for the Gate 2b RPCs plus the P1/P1.5 run RPCs used by orchestration.
 * Mirrors the SQL semantics the Worker depends on (idempotent insert, hash conflict,
 * same-Hive reuse, owner projection); it is not a substitute for the SQL qualification.
 */
type StoredFactVerification = Record<string, unknown> & {
  id: string;
  study_run_id: string;
  hive_id: string;
  origin_batch_id: string;
  candidate_key: string;
  verification_disposition: string;
  verification_reason_code: string | null;
  verifier_version: string;
  evidence_anchors_verified: number;
  candidate_status: string;
  value_json: unknown;
  source_document_id: string;
};

type StoredFactEvidence = Record<string, unknown> & {
  fact_id: string;
  anchor_index: number;
};

export class FakeExtractionStore {
  readonly runHive = new Map<string, string>();
  readonly prompts = new Map<string, Record<string, unknown>>();
  readonly batches: StoredBatch[] = [];
  readonly factVerifications: StoredFactVerification[] = [];
  readonly factEvidence: StoredFactEvidence[] = [];
  readonly documentPages = new Map<string, StoredDocumentPage[]>();
  readonly registeredSourcesById = new Map<string, WorkerRegisteredSourceRowV1>();
  readonly artifacts = new Map<string, Record<string, unknown>>();
  readonly transitions: Array<Record<string, unknown>> = [];
  readonly calls: string[] = [];
  readonly filenames = new Map<string, string>();
  contexts = new Map<string, Record<string, unknown>>();
  sources = new Map<string, WorkerRegisteredSourceRowV1[]>();
  private failures: Failure[] = [];
  private putFactFailAfterPersisted: number | null = null;
  private putFactFailMessage = "fact_invalid";
  private nextId = 1;

  addRun(studyRunId: string, hiveId: string): void {
    this.runHive.set(studyRunId, hiveId);
  }

  registerSource(row: WorkerRegisteredSourceRowV1): void {
    this.registeredSourcesById.set(row.source_document_id, row);
  }

  pagesForSource(sourceDocumentId: string): StoredDocumentPage[] {
    return this.documentPages.get(sourceDocumentId) ?? [];
  }

  /** Fail the next `count` calls to `fn`; `afterCommit` simulates a lost response after a write. */
  failNext(fn: string, message: string, count = 1, afterCommit = false): void {
    this.failures.push({ fn, message, remaining: count, afterCommit });
  }

  /** Fail Gate 2c put RPC after N facts are already persisted for the run (non-retryable). */
  failPutFactVerificationAfterPersisted(count: number, message = "fact_invalid"): void {
    this.putFactFailAfterPersisted = count;
    this.putFactFailMessage = message;
  }

  clearPutFactVerificationFailure(): void {
    this.putFactFailAfterPersisted = null;
  }

  batchesFor(studyRunId: string): StoredBatch[] {
    return this.batches.filter((batch) => batch.study_run_id === studyRunId);
  }

  factVerificationsFor(studyRunId: string): StoredFactVerification[] {
    return this.factVerifications.filter((row) => row.study_run_id === studyRunId);
  }

  readonly client: StudyRunPersistenceClient = {
    rpc: async (fn, args = {}) => {
      this.calls.push(fn);
      const failure = this.failures.find((f) => f.fn === fn && f.remaining > 0);
      if (failure && !failure.afterCommit) {
        failure.remaining -= 1;
        return { data: null, error: { message: failure.message } };
      }
      const result = this.handle(fn, args);
      if (failure && failure.afterCommit) {
        failure.remaining -= 1;
        return { data: null, error: { message: failure.message } };
      }
      return result;
    },
  };

  private summary(row: StoredBatch): Record<string, unknown> {
    return {
      id: row.id,
      study_run_id: row.study_run_id,
      source_document_id: row.source_document_id,
      prompt_digest: row.prompt_digest,
      page_start: row.page_start,
      page_end: row.page_end,
      status: row.status,
      disposition: row.disposition,
      classification_status: row.classification_status,
      primary_document_type_id: row.primary_document_type_id,
      extraction_sha256: row.extraction_sha256,
      validation_json: row.validation_json,
      error_code: row.error_code,
      error_reason: row.error_reason,
      reused_from_batch_id: row.reused_from_batch_id,
    };
  }

  private handle(fn: string, args: Record<string, unknown>): { data: unknown; error: { message: string } | null } {
    switch (fn) {
      case "hive3_p15_worker_get_processing_context": {
        const context = this.contexts.get(String(args.p_study_run_id));
        return context ? { data: context, error: null } : { data: null, error: { message: "not_found" } };
      }
      case "hive3_p15_worker_list_registered_sources":
        return { data: this.sources.get(String(args.p_study_run_id)) ?? [], error: null };
      case "hive3_p1p_worker_transition_study_run": {
        this.transitions.push({ ...args });
        return { data: { status: args.p_status, stage: args.p_stage }, error: null };
      }
      case "hive3_p1p_worker_put_run_artifact": {
        const key = `${args.p_study_run_id}|${args.p_artifact_kind}|${args.p_revision ?? 1}`;
        const existing = this.artifacts.get(key);
        if (existing && existing.content_sha256 !== args.p_content_sha256) {
          return { data: null, error: { message: "artifact_revision_hash_conflict" } };
        }
        const row = existing ?? {
          study_run_id: args.p_study_run_id,
          artifact_kind: args.p_artifact_kind,
          revision: args.p_revision ?? 1,
          content_sha256: args.p_content_sha256,
          payload_json: args.p_payload_jsonb,
        };
        this.artifacts.set(key, row);
        return { data: row, error: null };
      }
      case "hive3_p1p_worker_get_run_artifact": {
        const key = `${args.p_study_run_id}|${args.p_artifact_kind}|${args.p_revision ?? 1}`;
        const row = this.artifacts.get(key);
        return row ? { data: row, error: null } : { data: null, error: { message: "not_found" } };
      }
      case "hive3_p2px_worker_put_extraction_prompt": {
        const prompt = args.p_prompt as Record<string, unknown>;
        const digest = String(prompt.prompt_digest);
        const expected = `sha256:${sha256Hex(String(prompt.system_text))}`;
        if (digest !== expected) return { data: null, error: { message: "prompt_invalid" } };
        const existing = this.prompts.get(digest);
        if (existing) {
          return existing.system_text === prompt.system_text
            ? { data: { prompt_digest: digest, inserted: false }, error: null }
            : { data: null, error: { message: "prompt_digest_collision" } };
        }
        this.prompts.set(digest, prompt);
        return { data: { prompt_digest: digest, inserted: true }, error: null };
      }
      case "hive3_p2px_worker_get_run_batch": {
        const row = this.batches.find(
          (b) =>
            b.study_run_id === args.p_study_run_id &&
            b.source_document_id === args.p_source_document_id &&
            b.prompt_digest === args.p_prompt_digest &&
            b.page_start === args.p_page_start,
        );
        return { data: row ? { found: true, batch: this.summary(row) } : { found: false }, error: null };
      }
      case "hive3_p2px_worker_put_extraction_batch": {
        const runId = String(args.p_study_run_id);
        const hiveId = this.runHive.get(runId);
        if (!hiveId) return { data: null, error: { message: "not_found" } };
        const batch = args.p_batch as Record<string, unknown>;
        const existing = this.batches.find(
          (b) =>
            b.study_run_id === runId &&
            b.source_document_id === batch.source_document_id &&
            b.prompt_digest === batch.prompt_digest &&
            b.page_start === batch.page_start,
        );
        if (existing) {
          const same =
            existing.extraction_sha256 === batch.extraction_sha256 &&
            existing.status === batch.status &&
            existing.disposition === batch.disposition;
          return same
            ? { data: { inserted: false, batch: this.summary(existing) }, error: null }
            : { data: null, error: { message: "batch_hash_conflict" } };
        }
        if (batch.reused_from_batch_id) {
          const origin = this.batches.find((b) => b.id === batch.reused_from_batch_id);
          if (!origin || origin.hive_id !== hiveId) {
            return { data: null, error: { message: "batch_hive_mismatch" } };
          }
        }
        const row: StoredBatch = {
          ...structuredClone(batch),
          id: `batch-${this.nextId++}`,
          study_run_id: runId,
          hive_id: hiveId,
          source_document_id: String(batch.source_document_id),
          prompt_digest: String(batch.prompt_digest),
          page_start: Number(batch.page_start),
        };
        this.batches.push(row);
        return { data: { inserted: true, batch: this.summary(row) }, error: null };
      }
      case "hive3_p2px_worker_find_reusable_batch": {
        const runId = String(args.p_study_run_id);
        const hiveId = this.runHive.get(runId);
        const row = [...this.batches]
          .reverse()
          .find(
            (b) =>
              b.hive_id === hiveId &&
              b.study_run_id !== runId &&
              b.source_sha256 === args.p_source_sha256 &&
              b.read_fingerprint === args.p_read_fingerprint &&
              b.page_set_digest === args.p_page_set_digest &&
              b.prompt_digest === args.p_prompt_digest &&
              b.model_alias === args.p_model_alias &&
              b.page_start === args.p_page_start &&
              b.page_end === args.p_page_end &&
              b.status === "SUCCEEDED" &&
              (b.disposition === "VALID" || b.disposition === "VALID_WITH_REJECTIONS"),
          );
        return { data: row ? { found: true, batch: structuredClone(row) } : { found: false }, error: null };
      }
      case "hive3_p23_worker_put_document_pages": {
        const runId = String(args.p_study_run_id ?? "");
        const runHiveId = this.runHive.get(runId);
        if (!runHiveId) {
          return { data: null, error: { message: "study_run_not_found" } };
        }
        const sourceId = String(args.p_source_document_id ?? "");
        const registered =
          this.registeredSourcesById.get(sourceId) ??
          (this.sources.get(runId) ?? []).find((s) => s.source_document_id === sourceId);
        if (registered && registered.hive_id !== runHiveId) {
          return { data: null, error: { message: "page_hive_mismatch" } };
        }
        const sourceSha = String(args.p_source_sha256 ?? "").trim().toLowerCase();
        if (!/^[0-9a-f]{64}$/.test(sourceSha)) {
          return { data: null, error: { message: "page_source_sha256_mismatch" } };
        }
        if (registered && registered.sha256.trim().toLowerCase() !== sourceSha) {
          return { data: null, error: { message: "page_source_sha256_mismatch" } };
        }
        const readFp = String(args.p_read_fingerprint ?? "").trim();
        if (readFp.length === 0 || readFp.length > 128) {
          return { data: null, error: { message: "page_read_fingerprint_invalid" } };
        }
        const pageSetDigest = String(args.p_page_set_digest ?? "").trim().toLowerCase();
        if (!/^sha256:[0-9a-f]{64}$/.test(pageSetDigest)) {
          return { data: null, error: { message: "page_set_digest_invalid" } };
        }
        const pageCount = Number(args.p_page_count);
        const rawPages = args.p_pages;
        if (!Number.isInteger(pageCount) || pageCount < 1 || !Array.isArray(rawPages) || rawPages.length !== pageCount) {
          return { data: null, error: { message: "page_numbering_invalid" } };
        }
        const sortedInput = [...(rawPages as Array<Record<string, unknown>>)].sort(
          (a, b) => Number(a.page_number) - Number(b.page_number),
        );
        for (let i = 0; i < sortedInput.length; i += 1) {
          const item = sortedInput[i]!;
          if (Number(item.page_number) !== i + 1) {
            return { data: null, error: { message: "page_numbering_invalid" } };
          }
          if (typeof item.page_text !== "string") {
            return { data: null, error: { message: "page_invalid" } };
          }
          const byteLen = Buffer.byteLength(item.page_text, "utf8");
          if (byteLen > 65_536) {
            return { data: null, error: { message: "page_payload_too_large" } };
          }
          const expectedSha = `sha256:${sha256Hex(item.page_text)}`;
          if (item.page_text_sha256 !== expectedSha || Number(item.page_byte_length) !== byteLen) {
            return { data: null, error: { message: "page_invalid" } };
          }
        }
        const expectedDigest = computePageSetDigest({
          sourceSha256: sourceSha,
          pageCount,
          pages: sortedInput.map((item) => ({
            page_number: Number(item.page_number),
            page_text_sha256: String(item.page_text_sha256),
          })),
        });
        if (expectedDigest !== pageSetDigest) {
          return { data: null, error: { message: "page_set_digest_mismatch" } };
        }

        const existingPages = this.documentPages.get(sourceId) ?? [];
        const existingSourceHive = existingPages[0]?.hive_id;
        if (existingSourceHive && existingSourceHive !== runHiveId) {
          return { data: null, error: { message: "page_hive_mismatch" } };
        }
        const nextRows: StoredDocumentPage[] = [...existingPages];
        let insertedCount = 0;
        let replayedCount = 0;
        for (const item of sortedInput) {
          const pageNum = Number(item.page_number);
          const found = nextRows.find(
            (r) => r.page_set_digest === pageSetDigest && r.page_number === pageNum,
          );
          if (found) {
            const matches =
              found.hive_id === runHiveId &&
              found.source_sha256 === sourceSha &&
              found.read_fingerprint === readFp &&
              found.page_set_digest === pageSetDigest &&
              found.page_count === pageCount &&
              found.page_text_sha256 === item.page_text_sha256 &&
              found.page_byte_length === Number(item.page_byte_length) &&
              found.page_text === item.page_text &&
              found.extraction_method === item.extraction_method;
            if (!matches) {
              return { data: null, error: { message: "page_hash_conflict" } };
            }
            replayedCount += 1;
          } else {
            nextRows.push({
              id: `page-${this.nextId++}`,
              hive_id: runHiveId,
              source_document_id: sourceId,
              first_study_run_id: runId,
              source_sha256: sourceSha,
              read_fingerprint: readFp,
              page_set_digest: pageSetDigest,
              page_count: pageCount,
              page_number: pageNum,
              page_text: String(item.page_text),
              page_text_sha256: String(item.page_text_sha256),
              page_byte_length: Number(item.page_byte_length),
              extraction_method: String(item.extraction_method),
              extraction_status: "SUCCEEDED",
              provenance_json: structuredClone((item.provenance_json ?? {}) as Record<string, unknown>),
              created_at: "2026-10-25T00:00:00.000Z",
            });
            insertedCount += 1;
          }
        }
        this.documentPages.set(sourceId, nextRows);
        return {
          data: {
            source_document_id: sourceId,
            hive_id: runHiveId,
            source_sha256: sourceSha,
            read_fingerprint: readFp,
            page_set_digest: pageSetDigest,
            page_count: pageCount,
            inserted_count: insertedCount,
            replayed_count: replayedCount,
          },
          error: null,
        };
      }
      case "hive3_p23_worker_list_run_batches_for_verify": {
        const runId = String(args.p_study_run_id ?? "");
        const hiveId = this.runHive.get(runId);
        if (!hiveId) {
          return { data: null, error: { message: "study_run_not_found" } };
        }
        const batches = this.batchesFor(runId)
          .filter(
            (b) =>
              b.hive_id === hiveId &&
              b.status === "SUCCEEDED" &&
              (b.disposition === "VALID" || b.disposition === "VALID_WITH_REJECTIONS"),
          )
          .map((b) => ({
            batch_id: b.id,
            source_document_id: b.source_document_id,
            source_sha256: b.source_sha256,
            read_fingerprint: b.read_fingerprint,
            page_set_digest: b.page_set_digest,
            pack_id: b.pack_id,
            pack_version: b.pack_version,
            accepted_facts_json: b.accepted_facts_json ?? [],
          }));
        return {
          data: { study_run_id: runId, hive_id: hiveId, batches },
          error: null,
        };
      }
      case "hive3_p23_worker_put_fact_verification": {
        const runId = String(args.p_study_run_id ?? "");
        const hiveId = this.runHive.get(runId);
        if (!hiveId) {
          return { data: null, error: { message: "study_run_not_found" } };
        }
        if (
          this.putFactFailAfterPersisted !== null &&
          this.factVerificationsFor(runId).length >= this.putFactFailAfterPersisted
        ) {
          return { data: null, error: { message: this.putFactFailMessage } };
        }
        const fact = args.p_fact as Record<string, unknown>;
        const batchId = String(fact.origin_batch_id ?? "");
        const candidateKey = String(fact.candidate_key ?? "").toLowerCase();
        const disposition = String(fact.verification_disposition ?? "");
        const reasonRaw = fact.verification_reason_code;
        const reasonCode =
          reasonRaw === null || reasonRaw === undefined ? null : String(reasonRaw).trim();
        if (disposition === "VERIFIED" && reasonCode) {
          return { data: null, error: { message: "fact_invalid" } };
        }
        if (disposition !== "VERIFIED" && !reasonCode) {
          return { data: null, error: { message: "fact_invalid" } };
        }
        if (reasonCode && !/^[a-z0-9_]{1,64}$/.test(reasonCode)) {
          return { data: null, error: { message: "fact_invalid" } };
        }
        const batch = this.batches.find((b) => b.id === batchId);
        if (!batch || batch.study_run_id !== runId) {
          return { data: null, error: { message: "batch_not_found" } };
        }
        const existing = this.factVerifications.find(
          (row) =>
            row.study_run_id === runId &&
            row.origin_batch_id === batchId &&
            row.candidate_key === candidateKey,
        );
        if (existing) {
          const same =
            existing.verification_disposition === fact.verification_disposition &&
            existing.verification_reason_code === (fact.verification_reason_code ?? null) &&
            existing.verifier_version === fact.verifier_version &&
            existing.evidence_anchors_verified === fact.evidence_anchors_verified &&
            existing.candidate_status === fact.candidate_status &&
            JSON.stringify(existing.value_json) === JSON.stringify(fact.value_json ?? null);
          return same
            ? { data: { inserted: false, fact_id: existing.id }, error: null }
            : { data: null, error: { message: "fact_hash_conflict" } };
        }
        const factId = `fact-${this.nextId++}`;
        this.factVerifications.push({
          id: factId,
          study_run_id: runId,
          hive_id: hiveId,
          origin_batch_id: batchId,
          candidate_key: candidateKey,
          source_document_id: String(fact.source_document_id),
          verification_disposition: String(fact.verification_disposition),
          verification_reason_code: (fact.verification_reason_code as string | null) ?? null,
          verifier_version: String(fact.verifier_version),
          evidence_anchors_verified: Number(fact.evidence_anchors_verified ?? 0),
          candidate_status: String(fact.candidate_status),
          value_json: fact.value_json ?? null,
        });
        const evidence = Array.isArray(fact.evidence) ? fact.evidence : [];
        for (let idx = 0; idx < evidence.length; idx += 1) {
          const item = evidence[idx] as Record<string, unknown>;
          this.factEvidence.push({
            fact_id: factId,
            anchor_index: Number(item.anchor_index ?? idx),
            page_number: Number(item.page_number),
            exact_quote: item.exact_quote ?? null,
            document_page_id: item.document_page_id ?? null,
          });
        }
        return { data: { inserted: true, fact_id: factId }, error: null };
      }
      case "hive3_p23_worker_count_fact_verifications": {
        const runId = String(args.p_study_run_id ?? "");
        const hiveId = this.runHive.get(runId);
        if (!hiveId) {
          return { data: null, error: { message: "study_run_not_found" } };
        }
        const rows = this.factVerificationsFor(runId);
        return {
          data: {
            study_run_id: runId,
            hive_id: hiveId,
            total: rows.length,
            verified: rows.filter((r) => r.verification_disposition === "VERIFIED").length,
            rejected: rows.filter((r) => r.verification_disposition === "REJECTED").length,
            unresolved: rows.filter((r) => r.verification_disposition === "UNRESOLVED").length,
          },
          error: null,
        };
      }
      case "hive3_p23_worker_list_document_pages": {
        const runId = String(args.p_study_run_id ?? "");
        const runHiveId = this.runHive.get(runId);
        if (!runHiveId) {
          return { data: null, error: { message: "study_run_not_found" } };
        }
        const sourceId = String(args.p_source_document_id ?? "");
        const registered =
          this.registeredSourcesById.get(sourceId) ??
          (this.sources.get(runId) ?? []).find((s) => s.source_document_id === sourceId);
        if (registered && registered.hive_id !== runHiveId) {
          return { data: null, error: { message: "page_hive_mismatch" } };
        }
        const readFp = String(args.p_read_fingerprint ?? "").trim();
        if (readFp.length === 0 || readFp.length > 128) {
          return { data: null, error: { message: "page_read_fingerprint_invalid" } };
        }
        const pageSetDigest = String(args.p_page_set_digest ?? "").trim().toLowerCase();
        if (!/^sha256:[0-9a-f]{64}$/.test(pageSetDigest)) {
          return { data: null, error: { message: "page_set_digest_invalid" } };
        }
        const pages = (this.documentPages.get(sourceId) ?? []).filter(
          (p) =>
            p.hive_id === runHiveId &&
            p.read_fingerprint === readFp &&
            p.page_set_digest === pageSetDigest,
        );
        pages.sort((a, b) => a.page_number - b.page_number);
        if (pages.length > 0 && pages.length !== pages[0]!.page_count) {
          return { data: null, error: { message: "page_generation_incomplete" } };
        }
        const sourceSha =
          registered?.sha256.trim().toLowerCase() ??
          pages[0]?.source_sha256 ??
          sha256Hex(sourceId);
        return {
          data: {
            found: pages.length > 0,
            source_document_id: sourceId,
            hive_id: runHiveId,
            source_sha256: sourceSha,
            read_fingerprint: readFp,
            page_set_digest: pageSetDigest,
            pages: structuredClone(pages),
          },
          error: null,
        };
      }
      default:
        return { data: null, error: { message: `unexpected rpc ${fn}` } };
    }
  }

  /** Same projection as `hive3_p2px_owner_list_extraction_batches` (owner check elided). */
  ownerView(studyRunId: string): Record<string, unknown> {
    const hiveId = this.runHive.get(studyRunId) ?? "";
    const runSources = this.sources.get(studyRunId) ?? [];
    const sourceOrder = new Map(runSources.map((s, idx) => [s.source_document_id, idx]));
    const orderedBatches = [...this.batchesFor(studyRunId)].sort((a, b) => {
      const orderA = sourceOrder.get(a.source_document_id);
      const orderB = sourceOrder.get(b.source_document_id);
      if (orderA !== undefined && orderB !== undefined && orderA !== orderB) {
        return orderA - orderB;
      }
      if (a.source_document_id !== b.source_document_id) {
        return a.source_document_id.localeCompare(b.source_document_id);
      }
      return a.page_start - b.page_start;
    });
    return {
      contract_version: "pack-extraction-owner-view@1",
      study_run_id: studyRunId,
      hive_id: hiveId,
      batches: orderedBatches.map((b) => {
        const validation = b.validation_json as { counts?: unknown; rejections?: Array<{ reason_code: string }> };
        return {
          batch_id: b.id,
          source_document_id: b.source_document_id,
          filename: this.filenames.get(b.source_document_id) ?? "",
          page_start: b.page_start,
          page_end: b.page_end,
          is_partial: b.is_partial,
          status: b.status,
          disposition: b.disposition,
          classification_status: b.classification_status,
          primary_document_type_id: b.primary_document_type_id,
          pack_id: b.pack_id,
          pack_version: b.pack_version,
          counts: validation.counts ?? null,
          rejection_reason_codes: [...new Set((validation.rejections ?? []).map((r) => r.reason_code))],
          error_code: b.error_code,
          error_reason: b.error_reason,
          reused: b.reused_from_batch_id !== null,
          accepted_facts: b.accepted_facts_json,
        };
      }),
    };
  }
}
