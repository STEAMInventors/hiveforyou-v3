export type PackExtractionParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string; field?: string };

export const SHA256_HEX_RE = /^[0-9a-f]{64}$/i;
export const SHA256_DIGEST_RE = /^sha256:[0-9a-f]{64}$/i;

/** Keys that must never appear in pack-extraction user input (intent, tenant identity, prompt material). */
export const PACK_EXTRACTION_INPUT_FORBIDDEN_KEYS = [
  "request_text",
  "intent_text",
  "uploader_text",
  "verbatim_intent",
  "clarification_text",
  "question_set",
  "prior_extraction",
  "prior_extraction_output",
  "source_document_id",
  "hive_id",
  "owner_user_id",
  "user_id",
  "tenant_id",
  "study_run_id",
  "extraction_batch_id",
  "filename",
  "storage_path",
  "storage_bucket",
  "system_text",
  "prompt_text",
  "compiled_prompt",
  "system_prompt",
  "fact_catalog",
  "catalog",
  "document_types",
] as const;

/** Keys that must never appear in a pack-extraction-ref artifact (digests and versions only). */
export const PACK_EXTRACTION_REF_FORBIDDEN_KEYS = [
  "system_text",
  "prompt_text",
  "compiled_prompt",
  "system_prompt",
  "user_message",
  "pages",
  "page_text",
  "exact_quote",
  "intent_text",
  "request_text",
  "uploader_text",
  "verbatim_intent",
  "filename",
  "source_document_id",
  "hive_id",
  "owner_user_id",
  "user_id",
  "tenant_id",
] as const;

export const PACK_EXTRACTION_VALIDATION_REASON_CODES = [
  "UNKNOWN_FACT_ID",
  "FACT_NOT_IN_RECORD_TYPE",
  "TYPE_MISMATCH",
  "ENUM_INVALID",
  "MISSING_EVIDENCE",
  "PAGE_OUT_OF_RANGE",
  "QUOTE_NOT_IN_PAGE",
  "VALUE_WITH_NON_OBSERVED_STATUS",
  "UNKNOWN_RECORD_TYPE",
  "DUPLICATE_NON_REPEATABLE_RECORD",
  "SEGMENT_REF_INVALID",
] as const;

export type PackExtractionValidationReasonCodeV1 =
  (typeof PACK_EXTRACTION_VALIDATION_REASON_CODES)[number];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown, maxLen = 4096): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLen;
}

export function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX_RE.test(value);
}

export function isSha256Digest(value: unknown): value is string {
  return typeof value === "string" && SHA256_DIGEST_RE.test(value);
}

export function normalizeSha256Hex(value: string): string {
  return value.toLowerCase();
}

export function normalizeSha256Digest(value: string): string {
  return `sha256:${value.slice(7).toLowerCase()}`;
}

export function containsForbiddenKeys(
  value: unknown,
  forbidden: readonly string[],
  path = "",
): string | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const hit = containsForbiddenKeys(value[i], forbidden, `${path}[${i}]`);
      if (hit) {
        return hit;
      }
    }
    return null;
  }
  if (!isRecord(value)) {
    return null;
  }
  for (const key of Object.keys(value)) {
    if (forbidden.includes(key)) {
      return path ? `${path}.${key}` : key;
    }
    const nested = containsForbiddenKeys(value[key], forbidden, path ? `${path}.${key}` : key);
    if (nested) {
      return nested;
    }
  }
  return null;
}

export function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

export type PackExtractionEvidenceAnchorV1 = {
  page_number: number;
  exact_quote: string;
};

export function parseEvidenceAnchor(
  value: unknown,
  field: string,
  window?: { page_start: number; page_end: number },
): PackExtractionParseResult<PackExtractionEvidenceAnchorV1> {
  if (!isRecord(value)) {
    return { ok: false, message: "Evidence anchor must be an object.", field };
  }
  if (!isPositiveInt(value.page_number)) {
    return { ok: false, message: "page_number must be a positive integer.", field: `${field}.page_number` };
  }
  if (!isNonEmptyString(value.exact_quote, 16_384)) {
    return { ok: false, message: "exact_quote is required.", field: `${field}.exact_quote` };
  }
  if (window && (value.page_number < window.page_start || value.page_number > window.page_end)) {
    return {
      ok: false,
      message: "Evidence page_number is outside the request window.",
      field: `${field}.page_number`,
    };
  }
  return {
    ok: true,
    value: {
      page_number: value.page_number,
      exact_quote: value.exact_quote,
    },
  };
}

export function parseEvidenceAnchorList(
  value: unknown,
  field: string,
  window: { page_start: number; page_end: number } | undefined,
  minCount: number,
): PackExtractionParseResult<PackExtractionEvidenceAnchorV1[]> {
  if (!Array.isArray(value)) {
    return { ok: false, message: "evidence must be an array.", field };
  }
  if (value.length < minCount) {
    return {
      ok: false,
      message: `evidence requires at least ${minCount} anchor(s).`,
      field,
    };
  }
  const anchors: PackExtractionEvidenceAnchorV1[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const parsed = parseEvidenceAnchor(value[i], `${field}[${i}]`, window);
    if (!parsed.ok) {
      return parsed;
    }
    anchors.push(parsed.value);
  }
  return { ok: true, value: anchors };
}
