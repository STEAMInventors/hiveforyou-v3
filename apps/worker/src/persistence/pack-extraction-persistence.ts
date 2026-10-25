import { ErrorCode, type ErrorCodeType } from "@hiveforyou/contracts/errors/v1";
import {
  PACK_EXTRACTION_REF_VERSION,
  parsePackExtractionRefV1,
  type PackExtractionDispositionV1,
  type PackExtractionValidationV1,
} from "@hiveforyou/contracts/pack-extraction/v1";
import { RUN_ARTIFACT_CONTRACT_VERSION } from "@hiveforyou/contracts/study-runs/v1";

import type { CompiledPackSystemPrompt } from "../pack-extraction/compile-system-prompt.js";
import type { AcceptedPackFactV1 } from "../pack-extraction/validate-extraction.js";
import type { PackExtractionCacheStatus } from "../reasoning/litellm-usage.js";
import { putRunArtifactIdempotent } from "./artifact-idempotent-put.js";
import { StudyRunPersistenceError, type StudyRunPersistenceClient } from "./study-run-persistence.js";

/** At most three inline attempts for classified DB_TRANSIENT; Inngest owns further retries. */
export const MAX_INLINE_DB_TRANSIENT_ATTEMPTS = 3;

export const PACK_EXTRACTION_REF_ARTIFACT_KIND = PACK_EXTRACTION_REF_VERSION;

export class PackExtractionPersistenceError extends Error {
  readonly retryable: boolean;

  constructor(
    readonly errorCode: ErrorCodeType,
    readonly reason: string,
    message: string,
    retryable?: boolean,
  ) {
    super(message);
    this.name = "PackExtractionPersistenceError";
    this.retryable = retryable ?? errorCode === ErrorCode.DB_TRANSIENT;
  }
}

export type PackExtractionBatchSummary = {
  id: string;
  study_run_id: string;
  source_document_id: string;
  prompt_digest: string;
  page_start: number;
  page_end: number;
  status: "SUCCEEDED" | "FAILED";
  disposition: PackExtractionDispositionV1;
  classification_status: string | null;
  primary_document_type_id: string | null;
  extraction_sha256: string | null;
  validation_json: PackExtractionValidationV1;
  error_code: string | null;
  error_reason: string | null;
  reused_from_batch_id: string | null;
};

export type PackExtractionBatchInsert = {
  source_document_id: string;
  source_sha256: string;
  read_fingerprint: string;
  prompt_digest: string;
  pack_id: string;
  pack_version: string;
  pack_digest: string;
  output_contract_version: string;
  partition_id: string | null;
  page_start: number;
  page_end: number;
  is_partial: boolean;
  model_alias: string;
  provider_model: string | null;
  gateway_request_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens: number | null;
  cache_write_tokens: number | null;
  cache_status: PackExtractionCacheStatus;
  latency_ms: number | null;
  finish_reason: string | null;
  extraction_json: unknown;
  extraction_sha256: string | null;
  extraction_byte_length: number | null;
  validation_json: PackExtractionValidationV1;
  accepted_facts_json: AcceptedPackFactV1[];
  disposition: PackExtractionDispositionV1;
  classification_status: string | null;
  primary_document_type_id: string | null;
  validator_version: string;
  status: "SUCCEEDED" | "FAILED";
  error_code: string | null;
  error_reason: string | null;
  reused_from_batch_id: string | null;
};

export type ReusablePackExtractionBatch = {
  id: string;
  provider_model: string | null;
  finish_reason: string | null;
  extraction_json: unknown;
  extraction_sha256: string | null;
  extraction_byte_length: number | null;
  validation_json: PackExtractionValidationV1;
  accepted_facts_json: AcceptedPackFactV1[];
  disposition: PackExtractionDispositionV1;
  classification_status: string | null;
  primary_document_type_id: string | null;
  validator_version: string;
};

export type PackExtractionBatchKey = {
  studyRunId: string;
  sourceDocumentId: string;
  promptDigest: string;
  pageStart: number;
};

async function callRpc(
  client: StudyRunPersistenceClient,
  label: string,
  fn: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  let result: Awaited<ReturnType<StudyRunPersistenceClient["rpc"]>>;
  try {
    result = await client.rpc(fn, args);
  } catch (error) {
    throw new StudyRunPersistenceError(
      `${label}: ${error instanceof Error ? error.message : "rpc_failed"}`,
      error,
    );
  }
  if (result.error) {
    throw new StudyRunPersistenceError(`${label}: ${result.error.message}`, result.error);
  }
  if (result.data === null || result.data === undefined) {
    throw new StudyRunPersistenceError(`${label}: empty RPC response`);
  }
  return typeof result.data === "string" ? (JSON.parse(result.data) as unknown) : result.data;
}

function isTransient(error: unknown): boolean {
  return error instanceof StudyRunPersistenceError && error.boundary?.error_code === ErrorCode.DB_TRANSIENT;
}

function transientExhausted(label: string): PackExtractionPersistenceError {
  return new PackExtractionPersistenceError(
    ErrorCode.DB_TRANSIENT,
    "db_transient",
    `${label}: saving results is temporarily unavailable.`,
  );
}

async function withTransientRetry<T>(label: string, run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= MAX_INLINE_DB_TRANSIENT_ATTEMPTS; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!isTransient(error)) {
        throw error;
      }
    }
  }
  throw transientExhausted(label);
}

function signal(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

export async function putPackExtractionPrompt(
  client: StudyRunPersistenceClient,
  input: { compiled: CompiledPackSystemPrompt; studyRunId: string },
): Promise<{ inserted: boolean }> {
  const { compiled } = input;
  try {
    const data = await withTransientRetry("putPackExtractionPrompt", () =>
      callRpc(client, "putPackExtractionPrompt", "hive3_p2px_worker_put_extraction_prompt", {
        p_prompt: {
          prompt_digest: compiled.prompt_digest,
          prompt_template_version: compiled.prompt_template_version,
          extraction_rules_version: compiled.extraction_rules_version,
          output_contract_version: compiled.output_contract_version,
          pack_id: compiled.pack_id,
          pack_version: compiled.pack_version,
          pack_digest: compiled.pack_digest,
          pack_canonical_digest: compiled.pack_canonical_digest,
          catalog_digest: compiled.catalog_digest,
          output_schema_digest: compiled.output_schema_digest,
          partition_id: null,
          partition_plan_digest: null,
          system_text: compiled.system_text,
          prompt_byte_length: compiled.prompt_byte_length,
          estimated_prompt_tokens: compiled.estimated_prompt_tokens,
        },
        p_first_study_run_id: input.studyRunId,
      }),
    );
    return { inserted: (data as { inserted?: unknown }).inserted === true };
  } catch (error) {
    const message = signal(error);
    if (message?.includes("prompt_digest_collision")) {
      throw new PackExtractionPersistenceError(
        ErrorCode.EXTRACTION_FAILED,
        "prompt_digest_collision",
        "The extraction prompt could not be saved.",
      );
    }
    throw error;
  }
}

export async function getRunPackExtractionBatch(
  client: StudyRunPersistenceClient,
  key: PackExtractionBatchKey,
): Promise<PackExtractionBatchSummary | null> {
  const data = (await withTransientRetry("getRunPackExtractionBatch", () =>
    callRpc(client, "getRunPackExtractionBatch", "hive3_p2px_worker_get_run_batch", {
      p_study_run_id: key.studyRunId,
      p_source_document_id: key.sourceDocumentId,
      p_prompt_digest: key.promptDigest,
      p_page_start: key.pageStart,
    }),
  )) as { found?: boolean; batch?: PackExtractionBatchSummary };
  return data.found === true && data.batch ? data.batch : null;
}

export async function findReusablePackExtractionBatch(
  client: StudyRunPersistenceClient,
  input: {
    studyRunId: string;
    sourceSha256: string;
    readFingerprint: string;
    promptDigest: string;
    modelAlias: string;
    pageStart: number;
    pageEnd: number;
  },
): Promise<ReusablePackExtractionBatch | null> {
  const data = (await withTransientRetry("findReusablePackExtractionBatch", () =>
    callRpc(client, "findReusablePackExtractionBatch", "hive3_p2px_worker_find_reusable_batch", {
      p_study_run_id: input.studyRunId,
      p_source_sha256: input.sourceSha256,
      p_read_fingerprint: input.readFingerprint,
      p_prompt_digest: input.promptDigest,
      p_model_alias: input.modelAlias,
      p_page_start: input.pageStart,
      p_page_end: input.pageEnd,
    }),
  )) as { found?: boolean; batch?: ReusablePackExtractionBatch };
  return data.found === true && data.batch ? data.batch : null;
}

function sameBatchContent(existing: PackExtractionBatchSummary, batch: PackExtractionBatchInsert): boolean {
  return (
    existing.extraction_sha256 === batch.extraction_sha256 &&
    existing.status === batch.status &&
    existing.disposition === batch.disposition
  );
}

function batchConflict(): PackExtractionPersistenceError {
  return new PackExtractionPersistenceError(
    ErrorCode.INVALID_REQUEST,
    "batch_hash_conflict",
    "This extraction result conflicts with one already saved.",
  );
}

/**
 * Idempotent insert keyed by (study_run_id, source_document_id, prompt_digest, page_start).
 * A transient failure leaves the outcome unknown, so the row is read back by key before any
 * re-insert; same content is success, different content is a conflict (never overwritten).
 */
export async function putPackExtractionBatch(
  client: StudyRunPersistenceClient,
  studyRunId: string,
  batch: PackExtractionBatchInsert,
): Promise<{ inserted: boolean; batch: PackExtractionBatchSummary }> {
  const key: PackExtractionBatchKey = {
    studyRunId,
    sourceDocumentId: batch.source_document_id,
    promptDigest: batch.prompt_digest,
    pageStart: batch.page_start,
  };
  for (let attempt = 1; attempt <= MAX_INLINE_DB_TRANSIENT_ATTEMPTS; attempt += 1) {
    try {
      const data = (await callRpc(
        client,
        "putPackExtractionBatch",
        "hive3_p2px_worker_put_extraction_batch",
        { p_study_run_id: studyRunId, p_batch: batch },
      )) as { inserted?: boolean; batch: PackExtractionBatchSummary };
      return { inserted: data.inserted === true, batch: data.batch };
    } catch (error) {
      if (signal(error)?.includes("batch_hash_conflict")) {
        throw batchConflict();
      }
      if (!isTransient(error)) {
        throw error;
      }
      let existing: PackExtractionBatchSummary | null;
      try {
        existing = await getRunPackExtractionBatch(client, key);
      } catch (readError) {
        if (readError instanceof PackExtractionPersistenceError && readError.retryable) {
          continue;
        }
        throw readError;
      }
      if (existing) {
        if (sameBatchContent(existing, batch)) {
          return { inserted: false, batch: existing };
        }
        throw batchConflict();
      }
    }
  }
  throw transientExhausted("putPackExtractionBatch");
}

export async function putPackExtractionRefArtifact(
  client: StudyRunPersistenceClient,
  input: { studyRunId: string; compiled: CompiledPackSystemPrompt },
): Promise<void> {
  const { compiled } = input;
  const parsed = parsePackExtractionRefV1({
    contract_version: PACK_EXTRACTION_REF_VERSION,
    pack_id: compiled.pack_id,
    pack_version: compiled.pack_version,
    pack_digest: compiled.pack_digest,
    pack_canonical_digest: compiled.pack_canonical_digest,
    catalog_digest: compiled.catalog_digest,
    prompt_template_version: compiled.prompt_template_version,
    extraction_rules_version: compiled.extraction_rules_version,
    output_contract_version: compiled.output_contract_version,
    output_schema_digest: compiled.output_schema_digest,
    prompt_digests: [compiled.prompt_digest],
    partition_plan_digest: null,
  });
  if (!parsed.ok) {
    throw new PackExtractionPersistenceError(
      ErrorCode.EXTRACTION_FAILED,
      "ref_artifact_invalid",
      "The extraction reference could not be saved.",
    );
  }
  await withTransientRetry("putPackExtractionRefArtifact", () =>
    putRunArtifactIdempotent(client, {
      studyRunId: input.studyRunId,
      artifactKind: PACK_EXTRACTION_REF_ARTIFACT_KIND,
      contractVersion: RUN_ARTIFACT_CONTRACT_VERSION,
      payload: parsed.value,
    }),
  );
}
