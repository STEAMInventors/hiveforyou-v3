import { ErrorCode, type ErrorCodeType } from "@hiveforyou/contracts/errors/v1";
import {
  READER_DOCUMENT_READ_VERSION,
  type PageExtractionMethodV1,
  type ReaderModelCallProvenanceV1,
  type ReaderPageQualityV1,
  type ReaderReadDocumentProvenanceV1,
  type ReaderReadDocumentResponseV1,
} from "@hiveforyou/contracts/reader/v1";
import {
  computePageSetDigest,
  computeSha256Digest,
  DOCUMENT_PAGE_SET_DIGEST_VERSION,
} from "@hiveforyou/core";

import type { WorkerRegisteredSourceRowV1 } from "./p15-worker-context.js";
import { MAX_INLINE_DB_TRANSIENT_ATTEMPTS } from "./pack-extraction-persistence.js";
import { StudyRunPersistenceError, type StudyRunPersistenceClient } from "./study-run-persistence.js";

/** Plan Revision 2 T2 per-page text ceiling (64 KiB UTF-8 bytes, enforced in SQL and Worker). */
export const MAX_DOCUMENT_PAGE_TEXT_BYTES = 65_536;

/** Plan Revision 2 T2 per-page provenance JSON ceiling (64 KiB UTF-8 bytes). */
export const MAX_DOCUMENT_PAGE_PROVENANCE_BYTES = 65_536;

export const DOCUMENT_PAGE_PROVENANCE_VERSION = "document-page-provenance@1" as const;

export { DOCUMENT_PAGE_SET_DIGEST_VERSION, computePageSetDigest };

const SHA256_HEX_RE = /^[0-9a-f]{64}$/i;
const SHA256_DIGEST_RE = /^sha256:[0-9a-f]{64}$/i;

const ALLOWED_EXTRACTION_METHODS = new Set<PageExtractionMethodV1>([
  "pdf_native",
  "image_ocr_local",
  "image_ocr_litellm",
  "docx_render_v1",
]);

export class DocumentPagesPersistenceError extends Error {
  readonly retryable: boolean;

  constructor(
    readonly errorCode: ErrorCodeType,
    readonly reason: string,
    message: string,
    retryable?: boolean,
  ) {
    super(message);
    this.name = "DocumentPagesPersistenceError";
    this.retryable = retryable ?? errorCode === ErrorCode.DB_TRANSIENT;
  }
}

export type DocumentPageProvenanceV1 = {
  contract_version: typeof DOCUMENT_PAGE_PROVENANCE_VERSION;
  reader_contract_version: typeof READER_DOCUMENT_READ_VERSION;
  reader_git_sha: string;
  reader_version: string;
  tools: Record<string, string>;
  quality: ReaderPageQualityV1;
  model_calls: ReaderModelCallProvenanceV1[];
};

export type DocumentPageInsertRowV1 = {
  page_number: number;
  page_text: string;
  page_text_sha256: string;
  page_byte_length: number;
  extraction_method: PageExtractionMethodV1;
  provenance_json: DocumentPageProvenanceV1;
};

export type PersistedDocumentPageRowV1 = {
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
  extraction_method: PageExtractionMethodV1;
  extraction_status: "SUCCEEDED";
  provenance_json: DocumentPageProvenanceV1;
  created_at: string;
};

export type PutDocumentPagesOutcome = {
  source_document_id: string;
  hive_id: string;
  source_sha256: string;
  read_fingerprint: string;
  page_set_digest: string;
  page_count: number;
  inserted_count: number;
  replayed_count: number;
};

export type ListDocumentPagesOutcome = {
  found: boolean;
  source_document_id: string;
  hive_id: string;
  source_sha256: string;
  read_fingerprint: string;
  page_set_digest: string;
  pages: PersistedDocumentPageRowV1[];
};

export type DocumentPagesLogOutcome =
  | "pages_persisted"
  | "pages_replayed"
  | "pages_failed";

type DocumentPagesLogEvent = {
  level: "info" | "error";
  event: "document_pages_persistence";
  correlation_id: string;
  study_run_id: string;
  source_document_id: string;
  stage: "extract";
  outcome: DocumentPagesLogOutcome;
  page_count: number;
  inserted_count?: number;
  replayed_count?: number;
  error_code?: string | null;
  error_reason?: string | null;
  retryable?: boolean | null;
};

/** Sanitized log: IDs, stage, counts and codes only (never page text, quotes or filenames). */
function emitDocumentPagesLog(event: DocumentPagesLogEvent): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "worker",
    ...event,
  });
  if (event.level === "error") {
    console.error(line);
    return;
  }
  console.info(line);
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

function transientExhausted(label: string): DocumentPagesPersistenceError {
  return new DocumentPagesPersistenceError(
    ErrorCode.DB_TRANSIENT,
    "db_transient",
    `${label}: saving source pages is temporarily unavailable.`,
    true,
  );
}

function mapPersistenceError(error: unknown): DocumentPagesPersistenceError | null {
  if (error instanceof DocumentPagesPersistenceError) {
    return error;
  }
  const message = error instanceof Error ? error.message : "";
  if (message.includes("page_hive_mismatch")) {
    return new DocumentPagesPersistenceError(
      ErrorCode.ACCESS_DENIED,
      "page_hive_mismatch",
      "This document does not belong to the Hive.",
      false,
    );
  }
  if (message.includes("page_source_sha256_mismatch")) {
    return new DocumentPagesPersistenceError(
      ErrorCode.INVALID_REQUEST,
      "page_source_sha256_mismatch",
      "The document content hash did not match the registered source.",
      false,
    );
  }
  if (message.includes("page_read_fingerprint_invalid")) {
    return new DocumentPagesPersistenceError(
      ErrorCode.INVALID_REQUEST,
      "page_read_fingerprint_invalid",
      "The document read fingerprint is invalid.",
      false,
    );
  }
  if (message.includes("page_numbering_invalid")) {
    return new DocumentPagesPersistenceError(
      ErrorCode.INVALID_REQUEST,
      "page_numbering_invalid",
      "The document page numbering is invalid.",
      false,
    );
  }
  if (message.includes("page_payload_too_large")) {
    return new DocumentPagesPersistenceError(
      ErrorCode.EXTRACTION_FAILED,
      "payload_too_large",
      "A document page exceeds the maximum supported text size.",
      false,
    );
  }
  if (message.includes("page_hash_conflict")) {
    return new DocumentPagesPersistenceError(
      ErrorCode.INVALID_REQUEST,
      "page_hash_conflict",
      "This document page conflicts with one already saved.",
      false,
    );
  }
  if (message.includes("page_set_digest_invalid") || message.includes("page_set_digest_mismatch")) {
    return new DocumentPagesPersistenceError(
      ErrorCode.INVALID_REQUEST,
      "page_set_digest_mismatch",
      "The document page generation digest is invalid.",
      false,
    );
  }
  if (message.includes("page_generation_incomplete")) {
    return new DocumentPagesPersistenceError(
      ErrorCode.EXTRACTION_FAILED,
      "page_generation_incomplete",
      "Persisted document pages are incomplete for this generation.",
      false,
    );
  }
  if (message.includes("page_invalid")) {
    return new DocumentPagesPersistenceError(
      ErrorCode.INVALID_REQUEST,
      "page_invalid",
      "This document page could not be saved.",
      false,
    );
  }
  if (message.includes("document_not_found")) {
    return new DocumentPagesPersistenceError(
      ErrorCode.NOT_FOUND,
      "document_not_found",
      "The source document was not found.",
      false,
    );
  }
  if (message.includes("study_run_not_found")) {
    return new DocumentPagesPersistenceError(
      ErrorCode.NOT_FOUND,
      "study_run_not_found",
      "The processing run was not found.",
      false,
    );
  }
  return null;
}

function buildPageProvenance(
  provenance: ReaderReadDocumentProvenanceV1,
  pageNumber: number,
  quality: ReaderPageQualityV1,
): DocumentPageProvenanceV1 {
  const modelCalls = Array.isArray(provenance?.model_calls)
    ? provenance.model_calls.filter(
        (call) => Array.isArray(call.page_numbers) && call.page_numbers.includes(pageNumber),
      )
    : [];
  return {
    contract_version: DOCUMENT_PAGE_PROVENANCE_VERSION,
    reader_contract_version: READER_DOCUMENT_READ_VERSION,
    reader_git_sha: String(provenance?.reader_git_sha ?? ""),
    reader_version: String(provenance?.reader_version ?? ""),
    tools:
      provenance?.tools && typeof provenance.tools === "object" && !Array.isArray(provenance.tools)
        ? provenance.tools
        : {},
    quality: {
      character_count: quality.character_count,
      identity_text_sufficient: quality.identity_text_sufficient,
      issues: Array.isArray(quality.issues) ? [...quality.issues] : [],
    },
    model_calls: modelCalls,
  };
}

export function prepareDocumentPagesForInsert(input: {
  source: WorkerRegisteredSourceRowV1;
  read: ReaderReadDocumentResponseV1;
}): {
  sourceDocumentId: string;
  hiveId: string;
  sourceSha256: string;
  readFingerprint: string;
  pageSetDigest: string;
  pageCount: number;
  pages: DocumentPageInsertRowV1[];
} {
  const { source, read } = input;

  if (
    !read.source ||
    read.source.source_document_id !== source.source_document_id ||
    read.source.hive_id !== source.hive_id
  ) {
    throw new DocumentPagesPersistenceError(
      ErrorCode.ACCESS_DENIED,
      "page_hive_mismatch",
      "This document does not belong to the Hive.",
      false,
    );
  }

  const registeredSha = source.sha256?.trim().toLowerCase() ?? "";
  const readSha = read.source.sha256?.trim().toLowerCase() ?? "";
  if (
    read.source_hash_verified !== true ||
    !SHA256_HEX_RE.test(registeredSha) ||
    !SHA256_HEX_RE.test(readSha) ||
    registeredSha !== readSha
  ) {
    throw new DocumentPagesPersistenceError(
      ErrorCode.INVALID_REQUEST,
      "page_source_sha256_mismatch",
      "The document content hash did not match the registered source.",
      false,
    );
  }

  const readFingerprint = typeof read.read_fingerprint === "string" ? read.read_fingerprint.trim() : "";
  if (readFingerprint.length === 0 || readFingerprint.length > 128) {
    throw new DocumentPagesPersistenceError(
      ErrorCode.INVALID_REQUEST,
      "page_read_fingerprint_invalid",
      "The document read fingerprint is invalid.",
      false,
    );
  }

  const pageCount = read.page_count;
  if (
    typeof pageCount !== "number" ||
    !Number.isInteger(pageCount) ||
    pageCount < 1 ||
    !Array.isArray(read.pages) ||
    read.pages.length !== pageCount
  ) {
    throw new DocumentPagesPersistenceError(
      ErrorCode.INVALID_REQUEST,
      "page_numbering_invalid",
      "The document page numbering is invalid.",
      false,
    );
  }

  const sorted = [...read.pages].sort((a, b) => a.page_number - b.page_number);
  const rows: DocumentPageInsertRowV1[] = [];

  for (let i = 0; i < sorted.length; i += 1) {
    const page = sorted[i]!;
    const expectedPageNumber = i + 1;
    if (
      typeof page.page_number !== "number" ||
      !Number.isInteger(page.page_number) ||
      page.page_number !== expectedPageNumber
    ) {
      throw new DocumentPagesPersistenceError(
        ErrorCode.INVALID_REQUEST,
        "page_numbering_invalid",
        "The document page numbering is invalid.",
        false,
      );
    }

    if (typeof page.text !== "string") {
      throw new DocumentPagesPersistenceError(
        ErrorCode.INVALID_REQUEST,
        "page_invalid",
        "This document page could not be saved.",
        false,
      );
    }

    if (!ALLOWED_EXTRACTION_METHODS.has(page.extraction_method)) {
      throw new DocumentPagesPersistenceError(
        ErrorCode.INVALID_REQUEST,
        "page_invalid",
        "This document page could not be saved.",
        false,
      );
    }

    const byteLength = Buffer.byteLength(page.text, "utf8");
    if (byteLength > MAX_DOCUMENT_PAGE_TEXT_BYTES) {
      throw new DocumentPagesPersistenceError(
        ErrorCode.EXTRACTION_FAILED,
        "payload_too_large",
        "A document page exceeds the maximum supported text size.",
        false,
      );
    }

    const pageSha256 = computeSha256Digest(page.text);
    const provenanceJson = buildPageProvenance(read.provenance, page.page_number, page.quality);
    const provenanceBytes = Buffer.byteLength(JSON.stringify(provenanceJson), "utf8");
    if (provenanceBytes > MAX_DOCUMENT_PAGE_PROVENANCE_BYTES) {
      throw new DocumentPagesPersistenceError(
        ErrorCode.EXTRACTION_FAILED,
        "payload_too_large",
        "A document page exceeds the maximum supported metadata size.",
        false,
      );
    }

    rows.push({
      page_number: page.page_number,
      page_text: page.text,
      page_text_sha256: pageSha256,
      page_byte_length: byteLength,
      extraction_method: page.extraction_method,
      provenance_json: provenanceJson,
    });
  }

  const pageSetDigest = computePageSetDigest({
    sourceSha256: registeredSha,
    pageCount,
    pages: rows,
  });

  return {
    sourceDocumentId: source.source_document_id,
    hiveId: source.hive_id,
    sourceSha256: registeredSha,
    readFingerprint,
    pageSetDigest,
    pageCount,
    pages: rows,
  };
}

function samePersistedPages(
  existing: ListDocumentPagesOutcome,
  prepared: ReturnType<typeof prepareDocumentPagesForInsert>,
): boolean {
  if (!existing.found || existing.pages.length !== prepared.pageCount) {
    return false;
  }
  if (
    existing.source_document_id !== prepared.sourceDocumentId ||
    existing.hive_id !== prepared.hiveId ||
    existing.source_sha256.toLowerCase() !== prepared.sourceSha256 ||
    existing.read_fingerprint !== prepared.readFingerprint ||
    existing.page_set_digest !== prepared.pageSetDigest
  ) {
    return false;
  }
  for (let i = 0; i < prepared.pages.length; i += 1) {
    const target = prepared.pages[i]!;
    const stored = existing.pages[i];
    if (!stored) return false;
    if (
      stored.page_number !== target.page_number ||
      stored.page_count !== prepared.pageCount ||
      stored.source_sha256.toLowerCase() !== prepared.sourceSha256 ||
      stored.read_fingerprint !== prepared.readFingerprint ||
      stored.page_text_sha256.toLowerCase() !== target.page_text_sha256.toLowerCase() ||
      stored.page_byte_length !== target.page_byte_length ||
      stored.page_text !== target.page_text ||
      stored.extraction_method !== target.extraction_method
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Independently loads persisted `hive3.document_pages` rows for a study run and source document,
 * verifying page numbering, SHA-256 digests and byte lengths on read (Plan Revision 2 A3 / A5).
 */
export async function listDocumentPagesForSource(
  client: StudyRunPersistenceClient,
  input: {
    studyRunId: string;
    sourceDocumentId: string;
    readFingerprint: string;
    pageSetDigest: string;
    expectedHiveId?: string;
    expectedSourceSha256?: string;
  },
): Promise<ListDocumentPagesOutcome> {
  for (let attempt = 1; attempt <= MAX_INLINE_DB_TRANSIENT_ATTEMPTS; attempt += 1) {
    try {
      const raw = (await callRpc(
        client,
        "listDocumentPagesForSource",
        "hive3_p23_worker_list_document_pages",
        {
          p_study_run_id: input.studyRunId,
          p_source_document_id: input.sourceDocumentId,
          p_read_fingerprint: input.readFingerprint.trim(),
          p_page_set_digest: input.pageSetDigest.trim().toLowerCase(),
        },
      )) as Partial<ListDocumentPagesOutcome>;

      if (
        typeof raw?.source_document_id !== "string" ||
        typeof raw?.hive_id !== "string" ||
        typeof raw?.source_sha256 !== "string" ||
        typeof raw?.read_fingerprint !== "string" ||
        typeof raw?.page_set_digest !== "string" ||
        !Array.isArray(raw?.pages)
      ) {
        throw new DocumentPagesPersistenceError(
          ErrorCode.EXTRACTION_FAILED,
          "persistence_corrupt_jsonb",
          "Persisted document pages could not be read.",
          false,
        );
      }

      if (input.expectedHiveId && raw.hive_id !== input.expectedHiveId) {
        throw new DocumentPagesPersistenceError(
          ErrorCode.ACCESS_DENIED,
          "page_hive_mismatch",
          "This document does not belong to the Hive.",
          false,
        );
      }

      const expectedSha = input.expectedSourceSha256?.trim().toLowerCase();
      if (expectedSha && raw.source_sha256.trim().toLowerCase() !== expectedSha) {
        throw new DocumentPagesPersistenceError(
          ErrorCode.INVALID_REQUEST,
          "page_source_sha256_mismatch",
          "The document content hash did not match the registered source.",
          false,
        );
      }

      const pages = raw.pages as PersistedDocumentPageRowV1[];
      if (pages.length > 0) {
        const declaredCount = pages[0]!.page_count;
        if (
          typeof declaredCount !== "number" ||
          !Number.isInteger(declaredCount) ||
          declaredCount < 1 ||
          pages.length !== declaredCount
        ) {
          throw new DocumentPagesPersistenceError(
            ErrorCode.EXTRACTION_FAILED,
            "persistence_corrupt_jsonb",
            "Persisted document page count is incomplete or inconsistent.",
            false,
          );
        }
        for (let i = 0; i < pages.length; i += 1) {
          const row = pages[i]!;
          const expectedPageNum = i + 1;
          if (
            row.page_number !== expectedPageNum ||
            row.page_count !== declaredCount ||
            row.source_document_id !== raw.source_document_id ||
            row.hive_id !== raw.hive_id ||
            row.source_sha256.trim().toLowerCase() !== raw.source_sha256.trim().toLowerCase() ||
            typeof row.page_text !== "string" ||
            typeof row.page_text_sha256 !== "string" ||
            !SHA256_DIGEST_RE.test(row.page_text_sha256)
          ) {
            throw new DocumentPagesPersistenceError(
              ErrorCode.EXTRACTION_FAILED,
              "persistence_corrupt_jsonb",
              "Persisted document page metadata is inconsistent.",
              false,
            );
          }
          const computedByteLen = Buffer.byteLength(row.page_text, "utf8");
          const computedDigest = computeSha256Digest(row.page_text);
          if (
            computedByteLen > MAX_DOCUMENT_PAGE_TEXT_BYTES ||
            row.page_byte_length !== computedByteLen ||
            row.page_text_sha256.toLowerCase() !== computedDigest.toLowerCase()
          ) {
            throw new DocumentPagesPersistenceError(
              ErrorCode.EXTRACTION_FAILED,
              "artifact_hash_mismatch",
              "Persisted document page text failed integrity verification.",
              false,
            );
          }
        }
      }

      return {
        found: pages.length > 0,
        source_document_id: raw.source_document_id,
        hive_id: raw.hive_id,
        source_sha256: raw.source_sha256.trim().toLowerCase(),
        read_fingerprint: raw.read_fingerprint.trim(),
        page_set_digest: raw.page_set_digest.trim().toLowerCase(),
        pages,
      };
    } catch (error) {
      const mapped = mapPersistenceError(error);
      if (mapped) {
        throw mapped;
      }
      if (!isTransient(error)) {
        throw error;
      }
    }
  }
  throw transientExhausted("listDocumentPagesForSource");
}

/**
 * Idempotently persists all Reader-extracted pages for a registered source document.
 * On a transient failure with unknown commit outcome, reads back persisted pages by
 * `(study_run_id, source_document_id)` before retrying; identical content succeeds,
 * conflicting content fails closed without overwriting.
 */
export async function putDocumentPagesForSource(
  client: StudyRunPersistenceClient,
  input: {
    studyRunId: string;
    correlationId: string;
    source: WorkerRegisteredSourceRowV1;
    read: ReaderReadDocumentResponseV1;
  },
): Promise<PutDocumentPagesOutcome> {
  const logBase = {
    event: "document_pages_persistence" as const,
    correlation_id: input.correlationId,
    study_run_id: input.studyRunId,
    source_document_id: input.source.source_document_id,
    stage: "extract" as const,
  };

  let prepared: ReturnType<typeof prepareDocumentPagesForInsert>;
  try {
    prepared = prepareDocumentPagesForInsert({ source: input.source, read: input.read });
  } catch (error) {
    const mapped = mapPersistenceError(error);
    emitDocumentPagesLog({
      level: "error",
      ...logBase,
      outcome: "pages_failed",
      page_count: Array.isArray(input.read?.pages) ? input.read.pages.length : 0,
      error_code: mapped?.errorCode ?? ErrorCode.INVALID_REQUEST,
      error_reason: mapped?.reason ?? "page_invalid",
      retryable: false,
    });
    throw mapped ?? error;
  }

  for (let attempt = 1; attempt <= MAX_INLINE_DB_TRANSIENT_ATTEMPTS; attempt += 1) {
    try {
      const data = (await callRpc(
        client,
        "putDocumentPagesForSource",
        "hive3_p23_worker_put_document_pages",
        {
          p_study_run_id: input.studyRunId,
          p_source_document_id: prepared.sourceDocumentId,
          p_source_sha256: prepared.sourceSha256,
          p_read_fingerprint: prepared.readFingerprint,
          p_page_set_digest: prepared.pageSetDigest,
          p_page_count: prepared.pageCount,
          p_pages: prepared.pages,
        },
      )) as PutDocumentPagesOutcome;

      const insertedCount = Number(data.inserted_count ?? 0);
      const replayedCount = Number(data.replayed_count ?? 0);
      emitDocumentPagesLog({
        level: "info",
        ...logBase,
        outcome: insertedCount === 0 && replayedCount > 0 ? "pages_replayed" : "pages_persisted",
        page_count: prepared.pageCount,
        inserted_count: insertedCount,
        replayed_count: replayedCount,
      });
      return {
        source_document_id: prepared.sourceDocumentId,
        hive_id: String(data.hive_id ?? prepared.hiveId),
        source_sha256: prepared.sourceSha256,
        read_fingerprint: prepared.readFingerprint,
        page_set_digest: prepared.pageSetDigest,
        page_count: prepared.pageCount,
        inserted_count: insertedCount,
        replayed_count: replayedCount,
      };
    } catch (error) {
      const mapped = mapPersistenceError(error);
      if (mapped) {
        emitDocumentPagesLog({
          level: "error",
          ...logBase,
          outcome: "pages_failed",
          page_count: prepared.pageCount,
          error_code: mapped.errorCode,
          error_reason: mapped.reason,
          retryable: mapped.retryable,
        });
        throw mapped;
      }
      if (!isTransient(error)) {
        emitDocumentPagesLog({
          level: "error",
          ...logBase,
          outcome: "pages_failed",
          page_count: prepared.pageCount,
          error_code: ErrorCode.EXTRACTION_FAILED,
          error_reason: "page_persistence_failed",
          retryable: false,
        });
        throw error;
      }

      let existing: ListDocumentPagesOutcome;
      try {
        existing = await listDocumentPagesForSource(client, {
          studyRunId: input.studyRunId,
          sourceDocumentId: prepared.sourceDocumentId,
          readFingerprint: prepared.readFingerprint,
          pageSetDigest: prepared.pageSetDigest,
          expectedHiveId: prepared.hiveId,
          expectedSourceSha256: prepared.sourceSha256,
        });
      } catch (readError) {
        if (readError instanceof DocumentPagesPersistenceError && readError.retryable) {
          continue;
        }
        emitDocumentPagesLog({
          level: "error",
          ...logBase,
          outcome: "pages_failed",
          page_count: prepared.pageCount,
          error_code:
            readError instanceof DocumentPagesPersistenceError
              ? readError.errorCode
              : ErrorCode.EXTRACTION_FAILED,
          error_reason:
            readError instanceof DocumentPagesPersistenceError
              ? readError.reason
              : "page_persistence_failed",
          retryable:
            readError instanceof DocumentPagesPersistenceError ? readError.retryable : false,
        });
        throw readError;
      }

      if (existing.found) {
        if (samePersistedPages(existing, prepared)) {
          emitDocumentPagesLog({
            level: "info",
            ...logBase,
            outcome: "pages_replayed",
            page_count: prepared.pageCount,
            inserted_count: 0,
            replayed_count: prepared.pageCount,
          });
          return {
            source_document_id: prepared.sourceDocumentId,
            hive_id: existing.hive_id,
            source_sha256: prepared.sourceSha256,
            read_fingerprint: prepared.readFingerprint,
            page_set_digest: prepared.pageSetDigest,
            page_count: prepared.pageCount,
            inserted_count: 0,
            replayed_count: prepared.pageCount,
          };
        }
        const conflict = new DocumentPagesPersistenceError(
          ErrorCode.INVALID_REQUEST,
          "page_hash_conflict",
          "This document page conflicts with one already saved.",
          false,
        );
        emitDocumentPagesLog({
          level: "error",
          ...logBase,
          outcome: "pages_failed",
          page_count: prepared.pageCount,
          error_code: conflict.errorCode,
          error_reason: conflict.reason,
          retryable: false,
        });
        throw conflict;
      }
    }
  }

  const exhausted = transientExhausted("putDocumentPagesForSource");
  emitDocumentPagesLog({
    level: "error",
    ...logBase,
    outcome: "pages_failed",
    page_count: prepared.pageCount,
    error_code: exhausted.errorCode,
    error_reason: exhausted.reason,
    retryable: true,
  });
  throw exhausted;
}
