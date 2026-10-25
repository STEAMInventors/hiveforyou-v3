import type { PackExtractionParseResult } from "./common.js";
import type { PackExtractionDispositionV1 } from "./types.js";

export const PACK_EXTRACTION_PROGRESS_VERSION = "pack-extraction-progress@1" as const;

/** Run artifact kind prefix; one artifact per finished document: `<kind>:<source_document_id>`. */
export const PACK_EXTRACTION_DOCUMENT_ARTIFACT_KIND = "pack-extraction-document@1" as const;

export function packExtractionDocumentArtifactKind(sourceDocumentId: string): string {
  return `${PACK_EXTRACTION_DOCUMENT_ARTIFACT_KIND}:${sourceDocumentId}`;
}

/** Written by the Worker after every window of a document has a persisted batch. */
export type PackExtractionDocumentMarkerV1 = {
  source_document_id: string;
  disposition: PackExtractionDispositionV1;
  window_count: number;
};

/** Counts-only owner projection; no filenames, document ids, facts or quotes. */
export type PackExtractionProgressV1 = {
  contract_version: typeof PACK_EXTRACTION_PROGRESS_VERSION;
  study_run_id: string;
  hive_id: string;
  /** Null until the run's source set is recorded. */
  documents_total: number | null;
  documents_finished: number;
  documents_unusable: number;
};

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

/** Shape check for the owner progress RPC response (SQL -> web boundary). */
export function parsePackExtractionProgressV1(
  raw: unknown,
): PackExtractionParseResult<PackExtractionProgressV1> {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return { ok: false, message: "Progress is not JSON." };
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, message: "Progress must be an object." };
  }
  const row = value as Record<string, unknown>;
  if (row.contract_version !== PACK_EXTRACTION_PROGRESS_VERSION) {
    return { ok: false, message: "Unexpected contract version.", field: "contract_version" };
  }
  if (typeof row.study_run_id !== "string" || typeof row.hive_id !== "string") {
    return { ok: false, message: "Missing run or Hive id.", field: "study_run_id" };
  }
  if (row.documents_total !== null && !isCount(row.documents_total)) {
    return { ok: false, message: "documents_total must be a count or null.", field: "documents_total" };
  }
  if (!isCount(row.documents_finished)) {
    return { ok: false, message: "documents_finished must be a count.", field: "documents_finished" };
  }
  if (!isCount(row.documents_unusable) || row.documents_unusable > row.documents_finished) {
    return { ok: false, message: "documents_unusable is out of range.", field: "documents_unusable" };
  }
  if (row.documents_total !== null && row.documents_finished > row.documents_total) {
    return { ok: false, message: "documents_finished exceeds documents_total.", field: "documents_finished" };
  }
  return { ok: true, value: row as PackExtractionProgressV1 };
}
