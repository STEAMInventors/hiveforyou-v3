import { ErrorCode, type ErrorCodeType } from "@hiveforyou/contracts/errors/v1";
import type { EvidenceVerificationDispositionV1 } from "@hiveforyou/contracts/evidence-verification/v1";
import type { PackExtractionFactStatusV1 } from "@hiveforyou/contracts/pack-extraction/v1";

import type { AcceptedPackFactV1 } from "../pack-extraction/validate-extraction.js";
import { MAX_INLINE_DB_TRANSIENT_ATTEMPTS } from "./pack-extraction-persistence.js";
import { StudyRunPersistenceError, type StudyRunPersistenceClient } from "./study-run-persistence.js";

export class FactVerificationPersistenceError extends Error {
  readonly retryable: boolean;

  constructor(
    readonly errorCode: ErrorCodeType,
    readonly reason: string,
    message: string,
    retryable?: boolean,
  ) {
    super(message);
    this.name = "FactVerificationPersistenceError";
    this.retryable = retryable ?? errorCode === ErrorCode.DB_TRANSIENT;
  }
}

export type VerifyRunBatchRowV1 = {
  batch_id: string;
  source_document_id: string;
  source_sha256: string;
  read_fingerprint: string;
  page_set_digest: string;
  pack_id: string;
  pack_version: string;
  accepted_facts_json: AcceptedPackFactV1[];
};

export type FactVerificationEvidenceInsertV1 = {
  anchor_index: number;
  page_number: number;
  exact_quote: string | null;
  document_page_id: string | null;
};

export type FactVerificationInsertV1 = {
  origin_batch_id: string;
  source_document_id: string;
  candidate_key: string;
  pack_id: string;
  pack_version: string;
  record_type_id: string;
  record_local_id: string;
  parent_record_local_id: string | null;
  segment_index: number;
  fact_id: string;
  candidate_status: PackExtractionFactStatusV1;
  value_json: unknown;
  source_sha256: string;
  read_fingerprint: string;
  page_set_digest: string;
  verification_disposition: EvidenceVerificationDispositionV1;
  verification_reason_code: string | null;
  verifier_version: string;
  evidence_anchors_verified: number;
  evidence: FactVerificationEvidenceInsertV1[];
};

function signal(error: unknown): string | null {
  if (error instanceof StudyRunPersistenceError) {
    return error.boundary?.message_safe ?? error.message;
  }
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return null;
}

function mapFactVerificationSqlError(message: string): FactVerificationPersistenceError | null {
  if (message.includes("fact_hash_conflict")) {
    return new FactVerificationPersistenceError(
      ErrorCode.INVALID_REQUEST,
      "fact_hash_conflict",
      "This verification result conflicts with one already saved.",
      false,
    );
  }
  if (message.includes("fact_hive_mismatch") || message.includes("fact_batch_run_mismatch")) {
    return new FactVerificationPersistenceError(
      ErrorCode.ACCESS_DENIED,
      "fact_hive_mismatch",
      "This verification does not belong to the Hive.",
      false,
    );
  }
  if (message.includes("fact_invalid") || message.includes("fact_evidence_invalid")) {
    return new FactVerificationPersistenceError(
      ErrorCode.INVALID_REQUEST,
      "fact_invalid",
      "This verification result could not be saved.",
      false,
    );
  }
  if (message.includes("study_run_not_found")) {
    return new FactVerificationPersistenceError(
      ErrorCode.NOT_FOUND,
      "study_run_not_found",
      "The processing run was not found.",
      false,
    );
  }
  if (message.includes("batch_not_found") || message.includes("document_not_found")) {
    return new FactVerificationPersistenceError(
      ErrorCode.NOT_FOUND,
      "batch_not_found",
      "The extraction batch was not found.",
      false,
    );
  }
  return null;
}

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
    const message = result.error.message ?? "rpc_failed";
    const mapped = mapFactVerificationSqlError(message);
    if (mapped) throw mapped;
    throw new StudyRunPersistenceError(`${label}: ${message}`, result.error);
  }
  if (result.data === null || result.data === undefined) {
    throw new StudyRunPersistenceError(`${label}: empty RPC response`);
  }
  return typeof result.data === "string" ? (JSON.parse(result.data) as unknown) : result.data;
}

function isTransient(error: unknown): boolean {
  return error instanceof StudyRunPersistenceError && error.boundary?.error_code === ErrorCode.DB_TRANSIENT;
}

async function withTransientRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= MAX_INLINE_DB_TRANSIENT_ATTEMPTS; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof FactVerificationPersistenceError || !isTransient(error)) {
        throw error;
      }
      if (attempt >= MAX_INLINE_DB_TRANSIENT_ATTEMPTS) {
        throw error;
      }
    }
  }
  throw new StudyRunPersistenceError(`${label}: transient retry exhausted`);
}

export async function listRunBatchesForVerify(
  client: StudyRunPersistenceClient,
  studyRunId: string,
): Promise<VerifyRunBatchRowV1[]> {
  const data = (await withTransientRetry("listRunBatchesForVerify", () =>
    callRpc(client, "listRunBatchesForVerify", "hive3_p23_worker_list_run_batches_for_verify", {
      p_study_run_id: studyRunId,
    }),
  )) as { batches?: unknown[] };
  const batches = Array.isArray(data.batches) ? data.batches : [];
  return batches.map((row) => {
    const batch = row as Record<string, unknown>;
    return {
      batch_id: String(batch.batch_id),
      source_document_id: String(batch.source_document_id),
      source_sha256: String(batch.source_sha256),
      read_fingerprint: String(batch.read_fingerprint),
      page_set_digest: String(batch.page_set_digest),
      pack_id: String(batch.pack_id),
      pack_version: String(batch.pack_version),
      accepted_facts_json: (batch.accepted_facts_json ?? []) as AcceptedPackFactV1[],
    };
  });
}

export async function putFactVerification(
  client: StudyRunPersistenceClient,
  studyRunId: string,
  fact: FactVerificationInsertV1,
): Promise<{ inserted: boolean; factId: string }> {
  const data = (await withTransientRetry("putFactVerification", () =>
    callRpc(client, "putFactVerification", "hive3_p23_worker_put_fact_verification", {
      p_study_run_id: studyRunId,
      p_fact: {
        kind: "pack_extraction_candidate",
        origin_batch_id: fact.origin_batch_id,
        source_document_id: fact.source_document_id,
        candidate_key: fact.candidate_key,
        pack_id: fact.pack_id,
        pack_version: fact.pack_version,
        record_type_id: fact.record_type_id,
        record_local_id: fact.record_local_id,
        parent_record_local_id: fact.parent_record_local_id,
        segment_index: fact.segment_index,
        fact_id: fact.fact_id,
        candidate_status: fact.candidate_status,
        value_json: fact.value_json ?? null,
        source_sha256: fact.source_sha256,
        read_fingerprint: fact.read_fingerprint,
        page_set_digest: fact.page_set_digest,
        verification_disposition: fact.verification_disposition,
        verification_reason_code: fact.verification_reason_code,
        verifier_version: fact.verifier_version,
        evidence_anchors_verified: fact.evidence_anchors_verified,
        evidence: fact.evidence,
      },
    }),
  )) as { inserted?: boolean; fact_id?: string };
  return {
    inserted: data.inserted === true,
    factId: String(data.fact_id ?? ""),
  };
}

export async function countFactVerifications(
  client: StudyRunPersistenceClient,
  studyRunId: string,
): Promise<{ total: number; verified: number; rejected: number; unresolved: number }> {
  const data = (await withTransientRetry("countFactVerifications", () =>
    callRpc(client, "countFactVerifications", "hive3_p23_worker_count_fact_verifications", {
      p_study_run_id: studyRunId,
    }),
  )) as Record<string, unknown>;
  return {
    total: Number(data.total ?? 0),
    verified: Number(data.verified ?? 0),
    rejected: Number(data.rejected ?? 0),
    unresolved: Number(data.unresolved ?? 0),
  };
}
