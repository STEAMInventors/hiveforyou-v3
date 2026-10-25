import {
  isNonEmptyString,
  isRecord,
  PACK_EXTRACTION_VALIDATION_REASON_CODES,
  type PackExtractionParseResult,
} from "./common.js";
import {
  PACK_EXTRACTION_VALIDATION_VERSION,
  PACK_EXTRACTION_VALIDATOR_VERSION,
  type PackExtractionDispositionV1,
  type PackExtractionValidationCountsV1,
  type PackExtractionValidationRejectionV1,
  type PackExtractionValidationV1,
} from "./types.js";

function isDisposition(value: unknown): value is PackExtractionDispositionV1 {
  return (
    value === "VALID" ||
    value === "VALID_WITH_REJECTIONS" ||
    value === "UNRECOGNIZED" ||
    value === "UNUSABLE"
  );
}

function parseCounts(value: unknown): PackExtractionParseResult<PackExtractionValidationCountsV1> {
  if (!isRecord(value)) {
    return { ok: false, message: "counts must be an object.", field: "counts" };
  }
  const counts: PackExtractionValidationCountsV1 = {
    records: 0,
    facts_accepted: 0,
    facts_rejected: 0,
    records_rejected: 0,
  };
  for (const key of ["records", "facts_accepted", "facts_rejected", "records_rejected"] as const) {
    const n = value[key];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
      return { ok: false, message: `${key} must be a non-negative integer.`, field: `counts.${key}` };
    }
    counts[key] = n;
  }
  return {
    ok: true,
    value: counts,
  };
}

function parseRejection(value: unknown, index: number): PackExtractionParseResult<PackExtractionValidationRejectionV1> {
  const field = `rejections[${index}]`;
  if (!isRecord(value)) {
    return { ok: false, message: "Rejection entry must be an object.", field };
  }
  if (!isNonEmptyString(value.path, 512)) {
    return { ok: false, message: "path is required.", field: `${field}.path` };
  }
  if (!isNonEmptyString(value.reason_code, 128)) {
    return { ok: false, message: "reason_code is required.", field: `${field}.reason_code` };
  }
  const reason = value.reason_code.trim();
  if (!(PACK_EXTRACTION_VALIDATION_REASON_CODES as readonly string[]).includes(reason)) {
    return { ok: false, message: "Invalid validation reason_code.", field: `${field}.reason_code` };
  }
  return {
    ok: true,
    value: {
      path: value.path.trim(),
      reason_code: reason as PackExtractionValidationRejectionV1["reason_code"],
    },
  };
}

export function parsePackExtractionValidationV1(value: unknown): PackExtractionParseResult<PackExtractionValidationV1> {
  if (!isRecord(value)) {
    return { ok: false, message: "Validation payload must be a JSON object." };
  }
  if (value.contract_version !== PACK_EXTRACTION_VALIDATION_VERSION) {
    return {
      ok: false,
      message: "Invalid contract_version for pack-extraction-validation@1.",
      field: "contract_version",
    };
  }
  if (!isDisposition(value.disposition)) {
    return { ok: false, message: "Invalid disposition.", field: "disposition" };
  }
  const counts = parseCounts(value.counts);
  if (!counts.ok) {
    return counts;
  }
  if (!Array.isArray(value.rejections)) {
    return { ok: false, message: "rejections must be an array.", field: "rejections" };
  }
  const rejections: PackExtractionValidationRejectionV1[] = [];
  for (let i = 0; i < value.rejections.length; i += 1) {
    const parsed = parseRejection(value.rejections[i], i);
    if (!parsed.ok) {
      return parsed;
    }
    rejections.push(parsed.value);
  }
  if (value.disposition === "VALID" && rejections.length > 0) {
    return {
      ok: false,
      message: "VALID disposition must not include rejections.",
      field: "rejections",
    };
  }
  if (value.disposition === "VALID_WITH_REJECTIONS" && rejections.length === 0) {
    return {
      ok: false,
      message: "VALID_WITH_REJECTIONS requires at least one rejection.",
      field: "rejections",
    };
  }
  if (value.validator_version !== PACK_EXTRACTION_VALIDATOR_VERSION) {
    return {
      ok: false,
      message: "Invalid validator_version.",
      field: "validator_version",
    };
  }
  return {
    ok: true,
    value: {
      contract_version: PACK_EXTRACTION_VALIDATION_VERSION,
      disposition: value.disposition,
      counts: counts.value,
      rejections,
      validator_version: PACK_EXTRACTION_VALIDATOR_VERSION,
    },
  };
}
