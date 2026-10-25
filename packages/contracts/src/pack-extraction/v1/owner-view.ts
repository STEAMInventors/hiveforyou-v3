import type { PackExtractionParseResult, PackExtractionValidationReasonCodeV1 } from "./common.js";
import type {
  PackExtractionClassificationStatusV1,
  PackExtractionDispositionV1,
  PackExtractionFactStatusV1,
  PackExtractionValidationCountsV1,
} from "./types.js";

export const PACK_EXTRACTION_OWNER_VIEW_VERSION = "pack-extraction-owner-view@1" as const;

export type PackExtractionOwnerEvidenceV1 = { page_number: number; exact_quote: string };

/** Accepted candidate fact as persisted by the Worker; unverified until P2.3 verification. */
export type PackExtractionOwnerFactV1 = {
  record_type_id: string;
  record_local_id: string;
  parent_record_local_id: string | null;
  segment_index: number;
  fact_id: string;
  status: PackExtractionFactStatusV1;
  value?: unknown;
  reason_code?: string;
  evidence: PackExtractionOwnerEvidenceV1[];
};

export type PackExtractionOwnerBatchV1 = {
  batch_id: string;
  source_document_id: string;
  filename: string;
  page_start: number;
  page_end: number;
  is_partial: boolean;
  status: "SUCCEEDED" | "FAILED";
  disposition: PackExtractionDispositionV1;
  classification_status: PackExtractionClassificationStatusV1 | null;
  primary_document_type_id: string | null;
  pack_id: string;
  pack_version: string;
  counts: PackExtractionValidationCountsV1 | null;
  rejection_reason_codes: PackExtractionValidationReasonCodeV1[];
  error_code: string | null;
  error_reason: string | null;
  reused: boolean;
  accepted_facts: PackExtractionOwnerFactV1[] | null;
};

export type PackExtractionOwnerViewV1 = {
  contract_version: typeof PACK_EXTRACTION_OWNER_VIEW_VERSION;
  study_run_id: string;
  hive_id: string;
  batches: PackExtractionOwnerBatchV1[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBatch(value: unknown): value is PackExtractionOwnerBatchV1 {
  if (!isRecord(value)) return false;
  return (
    typeof value.batch_id === "string" &&
    typeof value.source_document_id === "string" &&
    typeof value.filename === "string" &&
    Number.isInteger(value.page_start) &&
    Number.isInteger(value.page_end) &&
    typeof value.is_partial === "boolean" &&
    (value.status === "SUCCEEDED" || value.status === "FAILED") &&
    typeof value.disposition === "string" &&
    Array.isArray(value.rejection_reason_codes) &&
    (value.accepted_facts === null || Array.isArray(value.accepted_facts))
  );
}

/** Shape check for the owner read RPC response (SQL -> web boundary). */
export function parsePackExtractionOwnerViewV1(
  raw: unknown,
): PackExtractionParseResult<PackExtractionOwnerViewV1> {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return { ok: false, message: "Owner view is not JSON." };
    }
  }
  if (!isRecord(value) || value.contract_version !== PACK_EXTRACTION_OWNER_VIEW_VERSION) {
    return { ok: false, message: "Unexpected contract version.", field: "contract_version" };
  }
  if (typeof value.study_run_id !== "string" || typeof value.hive_id !== "string") {
    return { ok: false, message: "Missing run or Hive id.", field: "study_run_id" };
  }
  if (!Array.isArray(value.batches)) {
    return { ok: false, message: "batches must be an array.", field: "batches" };
  }
  const badIndex = value.batches.findIndex((batch) => !isBatch(batch));
  if (badIndex >= 0) {
    return { ok: false, message: "Malformed batch.", field: `batches[${badIndex}]` };
  }
  return { ok: true, value: value as PackExtractionOwnerViewV1 };
}
