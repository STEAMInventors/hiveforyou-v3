import {
  containsForbiddenKeys,
  isNonEmptyString,
  isPositiveInt,
  isRecord,
  isSha256Digest,
  isSha256Hex,
  normalizeSha256Digest,
  normalizeSha256Hex,
  PACK_EXTRACTION_INPUT_FORBIDDEN_KEYS,
  type PackExtractionParseResult,
} from "./common.js";
import {
  PACK_EXTRACTION_INPUT_VERSION,
  type PackExtractionInputPageMetaV1,
  type PackExtractionInputPageV1,
  type PackExtractionInputSourceMetadataV1,
  type PackExtractionInputSourceRefV1,
  type PackExtractionInputV1,
  type PackExtractionInputWindowV1,
} from "./types.js";

function parseSourceRef(value: unknown): PackExtractionParseResult<PackExtractionInputSourceRefV1> {
  if (!isRecord(value)) {
    return { ok: false, message: "source_ref must be an object.", field: "source_ref" };
  }
  if (!isNonEmptyString(value.source_ref_id, 128)) {
    return { ok: false, message: "source_ref_id is required.", field: "source_ref.source_ref_id" };
  }
  if (!isSha256Hex(value.source_sha256)) {
    return { ok: false, message: "source_sha256 must be a SHA-256 hex digest.", field: "source_ref.source_sha256" };
  }
  if (!isNonEmptyString(value.read_fingerprint, 128)) {
    return { ok: false, message: "read_fingerprint is required.", field: "source_ref.read_fingerprint" };
  }
  return {
    ok: true,
    value: {
      source_ref_id: value.source_ref_id.trim(),
      source_sha256: normalizeSha256Hex(value.source_sha256),
      read_fingerprint: value.read_fingerprint.trim(),
    },
  };
}

function parseWindow(value: unknown): PackExtractionParseResult<PackExtractionInputWindowV1> {
  if (!isRecord(value)) {
    return { ok: false, message: "window must be an object.", field: "source_metadata.window" };
  }
  if (!isPositiveInt(value.page_start)) {
    return { ok: false, message: "page_start must be a positive integer.", field: "source_metadata.window.page_start" };
  }
  if (!isPositiveInt(value.page_end)) {
    return { ok: false, message: "page_end must be a positive integer.", field: "source_metadata.window.page_end" };
  }
  if (value.page_end < value.page_start) {
    return { ok: false, message: "page_end must be >= page_start.", field: "source_metadata.window.page_end" };
  }
  if (typeof value.is_partial !== "boolean") {
    return { ok: false, message: "is_partial must be a boolean.", field: "source_metadata.window.is_partial" };
  }
  return {
    ok: true,
    value: {
      page_start: value.page_start,
      page_end: value.page_end,
      is_partial: value.is_partial,
    },
  };
}

function parsePageMeta(value: unknown, index: number): PackExtractionParseResult<PackExtractionInputPageMetaV1> {
  const field = `source_metadata.pages[${index}]`;
  if (!isRecord(value)) {
    return { ok: false, message: "Page metadata entry must be an object.", field };
  }
  if (!isPositiveInt(value.page_number)) {
    return { ok: false, message: "page_number must be a positive integer.", field: `${field}.page_number` };
  }
  if (!isNonEmptyString(value.extraction_method, 64)) {
    return { ok: false, message: "extraction_method is required.", field: `${field}.extraction_method` };
  }
  if (!isNonEmptyString(value.quality, 64)) {
    return { ok: false, message: "quality is required.", field: `${field}.quality` };
  }
  return {
    ok: true,
    value: {
      page_number: value.page_number,
      extraction_method: value.extraction_method.trim(),
      quality: value.quality.trim(),
    },
  };
}

function parseSourceMetadata(value: unknown): PackExtractionParseResult<PackExtractionInputSourceMetadataV1> {
  if (!isRecord(value)) {
    return { ok: false, message: "source_metadata must be an object.", field: "source_metadata" };
  }
  if (!isNonEmptyString(value.mime_family, 64)) {
    return { ok: false, message: "mime_family is required.", field: "source_metadata.mime_family" };
  }
  if (!isPositiveInt(value.page_count)) {
    return { ok: false, message: "page_count must be a positive integer.", field: "source_metadata.page_count" };
  }
  const windowParsed = parseWindow(value.window);
  if (!windowParsed.ok) {
    return windowParsed;
  }
  if (!Array.isArray(value.pages)) {
    return { ok: false, message: "source_metadata.pages must be an array.", field: "source_metadata.pages" };
  }
  const pages: PackExtractionInputPageMetaV1[] = [];
  const seenMeta = new Set<number>();
  for (let i = 0; i < value.pages.length; i += 1) {
    const parsed = parsePageMeta(value.pages[i], i);
    if (!parsed.ok) {
      return parsed;
    }
    if (seenMeta.has(parsed.value.page_number)) {
      return {
        ok: false,
        message: "Duplicate page_number in source_metadata.pages.",
        field: `source_metadata.pages[${i}].page_number`,
      };
    }
    seenMeta.add(parsed.value.page_number);
    pages.push(parsed.value);
  }
  return {
    ok: true,
    value: {
      mime_family: value.mime_family.trim(),
      page_count: value.page_count,
      window: windowParsed.value,
      pages,
    },
  };
}

function parseInputPage(
  value: unknown,
  index: number,
  window: PackExtractionInputWindowV1,
): PackExtractionParseResult<PackExtractionInputPageV1> {
  const field = `pages[${index}]`;
  if (!isRecord(value)) {
    return { ok: false, message: "Page entry must be an object.", field };
  }
  if (!isPositiveInt(value.page_number)) {
    return { ok: false, message: "page_number must be a positive integer.", field: `${field}.page_number` };
  }
  if (value.page_number < window.page_start || value.page_number > window.page_end) {
    return {
      ok: false,
      message: "Page number is outside the declared window.",
      field: `${field}.page_number`,
    };
  }
  if (typeof value.text !== "string") {
    return { ok: false, message: "text must be a string.", field: `${field}.text` };
  }
  if (value.text.length === 0) {
    return { ok: false, message: "text must not be empty.", field: `${field}.text` };
  }
  return {
    ok: true,
    value: {
      page_number: value.page_number,
      text: value.text,
    },
  };
}

function validateWindowCoverage(
  window: PackExtractionInputWindowV1,
  pageCount: number,
  textPages: PackExtractionInputPageV1[],
  metaPages: PackExtractionInputPageMetaV1[],
): PackExtractionParseResult<void> {
  if (window.page_end > pageCount) {
    return {
      ok: false,
      message: "window.page_end exceeds source_metadata.page_count.",
      field: "source_metadata.window.page_end",
    };
  }
  const expectedCount = window.page_end - window.page_start + 1;
  if (textPages.length !== expectedCount) {
    return {
      ok: false,
      message: "pages must include one entry for each page in the window.",
      field: "pages",
    };
  }
  const textNumbers = new Set(textPages.map((p) => p.page_number));
  for (let n = window.page_start; n <= window.page_end; n += 1) {
    if (!textNumbers.has(n)) {
      return {
        ok: false,
        message: `Missing page text for page ${n} within the window.`,
        field: "pages",
      };
    }
  }
  for (const meta of metaPages) {
    if (meta.page_number < window.page_start || meta.page_number > window.page_end) {
      return {
        ok: false,
        message: "source_metadata.pages entry falls outside the window.",
        field: "source_metadata.pages",
      };
    }
  }
  return { ok: true, value: undefined };
}

export function parsePackExtractionInputV1(value: unknown): PackExtractionParseResult<PackExtractionInputV1> {
  if (!isRecord(value)) {
    return { ok: false, message: "Input payload must be a JSON object." };
  }
  if (value.contract_version !== PACK_EXTRACTION_INPUT_VERSION) {
    return {
      ok: false,
      message: "Invalid contract_version for pack-extraction-input@1.",
      field: "contract_version",
    };
  }
  const forbidden = containsForbiddenKeys(value, PACK_EXTRACTION_INPUT_FORBIDDEN_KEYS);
  if (forbidden) {
    return {
      ok: false,
      message: "Input must not contain forbidden intent, identity or prompt fields.",
      field: forbidden,
    };
  }
  if (!isSha256Digest(value.prompt_digest)) {
    return { ok: false, message: "prompt_digest must be sha256:<64 hex>.", field: "prompt_digest" };
  }
  const sourceRef = parseSourceRef(value.source_ref);
  if (!sourceRef.ok) {
    return sourceRef;
  }
  const sourceMetadata = parseSourceMetadata(value.source_metadata);
  if (!sourceMetadata.ok) {
    return sourceMetadata;
  }
  if (!Array.isArray(value.pages)) {
    return { ok: false, message: "pages must be an array.", field: "pages" };
  }
  const textPages: PackExtractionInputPageV1[] = [];
  const seenText = new Set<number>();
  for (let i = 0; i < value.pages.length; i += 1) {
    const parsed = parseInputPage(value.pages[i], i, sourceMetadata.value.window);
    if (!parsed.ok) {
      return parsed;
    }
    if (seenText.has(parsed.value.page_number)) {
      return {
        ok: false,
        message: "Duplicate page_number in pages.",
        field: `pages[${i}].page_number`,
      };
    }
    seenText.add(parsed.value.page_number);
    textPages.push(parsed.value);
  }
  textPages.sort((a, b) => a.page_number - b.page_number);
  const coverage = validateWindowCoverage(
    sourceMetadata.value.window,
    sourceMetadata.value.page_count,
    textPages,
    sourceMetadata.value.pages,
  );
  if (!coverage.ok) {
    return coverage;
  }
  return {
    ok: true,
    value: {
      contract_version: PACK_EXTRACTION_INPUT_VERSION,
      prompt_digest: normalizeSha256Digest(value.prompt_digest),
      source_ref: sourceRef.value,
      source_metadata: sourceMetadata.value,
      pages: textPages,
    },
  };
}
