import {
  isNonEmptyString,
  isPositiveInt,
  isRecord,
  isSha256Digest,
  normalizeSha256Digest,
  parseEvidenceAnchorList,
  type PackExtractionParseResult,
} from "./common.js";
import {
  PACK_EXTRACTION_OUTPUT_VERSION,
  type PackExtractionAmbiguityV1,
  type PackExtractionClassificationCandidateV1,
  type PackExtractionClassificationSegmentV1,
  type PackExtractionClassificationV1,
  type PackExtractionFactV1,
  type PackExtractionMissingFactV1,
  type PackExtractionOutputV1,
  type PackExtractionRecordV1,
  type ParsePackExtractionOutputOptionsV1,
} from "./types.js";

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function parseFact(value: unknown, factId: string, options?: ParsePackExtractionOutputOptionsV1): PackExtractionParseResult<PackExtractionFactV1> {
  const field = `facts.${factId}`;
  if (!isRecord(value)) {
    return { ok: false, message: "Fact entry must be an object.", field };
  }
  const status = value.status;
  if (status === "NOT_FOUND" || status === "NOT_APPLICABLE") {
    if (hasOwn(value, "value")) {
      return {
        ok: false,
        message: "NOT_FOUND and NOT_APPLICABLE facts must not include value.",
        field: `${field}.value`,
      };
    }
    if (hasOwn(value, "evidence")) {
      return {
        ok: false,
        message: "NOT_FOUND and NOT_APPLICABLE facts must not include evidence.",
        field: `${field}.evidence`,
      };
    }
    if (hasOwn(value, "reason_code")) {
      return {
        ok: false,
        message: "NOT_FOUND and NOT_APPLICABLE facts must not include reason_code.",
        field: `${field}.reason_code`,
      };
    }
    return { ok: true, value: { status } };
  }
  if (status !== "OBSERVED" && status !== "UNCERTAIN") {
    return { ok: false, message: "Invalid fact status.", field: `${field}.status` };
  }
  if (!hasOwn(value, "value")) {
    return { ok: false, message: "OBSERVED and UNCERTAIN facts require value.", field: `${field}.value` };
  }
  const evidence = parseEvidenceAnchorList(value.evidence, `${field}.evidence`, options?.window, 1);
  if (!evidence.ok) {
    return evidence;
  }
  if (status === "UNCERTAIN") {
    if (!isNonEmptyString(value.reason_code, 128)) {
      return { ok: false, message: "UNCERTAIN facts require reason_code.", field: `${field}.reason_code` };
    }
    return {
      ok: true,
      value: {
        status: "UNCERTAIN",
        value: value.value,
        reason_code: value.reason_code.trim(),
        evidence: evidence.value,
      },
    };
  }
  return {
    ok: true,
    value: {
      status: "OBSERVED",
      value: value.value,
      evidence: evidence.value,
    },
  };
}

function parseRecord(
  value: unknown,
  index: number,
  options?: ParsePackExtractionOutputOptionsV1,
): PackExtractionParseResult<PackExtractionRecordV1> {
  const field = `records[${index}]`;
  if (!isRecord(value)) {
    return { ok: false, message: "Record must be an object.", field };
  }
  if (!isNonEmptyString(value.record_type_id, 128)) {
    return { ok: false, message: "record_type_id is required.", field: `${field}.record_type_id` };
  }
  if (!isNonEmptyString(value.record_local_id, 128)) {
    return { ok: false, message: "record_local_id is required.", field: `${field}.record_local_id` };
  }
  if (typeof value.segment_index !== "number" || !Number.isInteger(value.segment_index) || value.segment_index < 0) {
    return { ok: false, message: "segment_index must be a non-negative integer.", field: `${field}.segment_index` };
  }
  if (!isRecord(value.facts)) {
    return { ok: false, message: "facts must be an object.", field: `${field}.facts` };
  }
  const facts: Record<string, PackExtractionFactV1> = {};
  for (const factId of Object.keys(value.facts)) {
    if (!isNonEmptyString(factId, 256)) {
      return { ok: false, message: "Invalid fact_id key.", field: `${field}.facts` };
    }
    const parsed = parseFact(value.facts[factId], factId, options);
    if (!parsed.ok) {
      return { ...parsed, field: `${field}.${parsed.field ?? "facts"}` };
    }
    facts[factId] = parsed.value;
  }
  if (!Array.isArray(value.children)) {
    return { ok: false, message: "children must be an array.", field: `${field}.children` };
  }
  const children: PackExtractionRecordV1[] = [];
  for (let i = 0; i < value.children.length; i += 1) {
    const child = parseRecord(value.children[i], i, options);
    if (!child.ok) {
      return { ...child, field: `${field}.children.${child.field ?? i}` };
    }
    children.push(child.value);
  }
  return {
    ok: true,
    value: {
      record_type_id: value.record_type_id.trim(),
      record_local_id: value.record_local_id.trim(),
      segment_index: value.segment_index,
      facts,
      children,
    },
  };
}

function parseClassificationCandidate(
  value: unknown,
  index: number,
  options?: ParsePackExtractionOutputOptionsV1,
): PackExtractionParseResult<PackExtractionClassificationCandidateV1> {
  const field = `classification.candidates[${index}]`;
  if (!isRecord(value)) {
    return { ok: false, message: "Classification candidate must be an object.", field };
  }
  if (!isNonEmptyString(value.document_type_id, 128)) {
    return { ok: false, message: "document_type_id is required.", field: `${field}.document_type_id` };
  }
  if (!isPositiveInt(value.rank)) {
    return { ok: false, message: "rank must be a positive integer.", field: `${field}.rank` };
  }
  const evidence = parseEvidenceAnchorList(value.evidence, `${field}.evidence`, options?.window, 1);
  if (!evidence.ok) {
    return evidence;
  }
  return {
    ok: true,
    value: {
      document_type_id: value.document_type_id.trim(),
      rank: value.rank,
      evidence: evidence.value,
    },
  };
}

function parseSegment(
  value: unknown,
  index: number,
): PackExtractionParseResult<PackExtractionClassificationSegmentV1> {
  const field = `classification.segments[${index}]`;
  if (!isRecord(value)) {
    return { ok: false, message: "Segment must be an object.", field };
  }
  if (!isNonEmptyString(value.document_type_id, 128)) {
    return { ok: false, message: "document_type_id is required.", field: `${field}.document_type_id` };
  }
  if (!isPositiveInt(value.page_start)) {
    return { ok: false, message: "page_start must be a positive integer.", field: `${field}.page_start` };
  }
  if (!isPositiveInt(value.page_end)) {
    return { ok: false, message: "page_end must be a positive integer.", field: `${field}.page_end` };
  }
  if (value.page_end < value.page_start) {
    return { ok: false, message: "page_end must be >= page_start.", field: `${field}.page_end` };
  }
  return {
    ok: true,
    value: {
      document_type_id: value.document_type_id.trim(),
      page_start: value.page_start,
      page_end: value.page_end,
    },
  };
}

function segmentsOverlap(segments: PackExtractionClassificationSegmentV1[]): boolean {
  const sorted = [...segments].sort((a, b) => a.page_start - b.page_start);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].page_start <= sorted[i - 1].page_end) {
      return true;
    }
  }
  return false;
}

function parseClassification(
  value: unknown,
  options?: ParsePackExtractionOutputOptionsV1,
): PackExtractionParseResult<PackExtractionClassificationV1> {
  if (!isRecord(value)) {
    return { ok: false, message: "classification must be an object.", field: "classification" };
  }
  const status = value.status;
  if (
    status !== "CLASSIFIED" &&
    status !== "AMBIGUOUS" &&
    status !== "COMPOUND" &&
    status !== "UNRECOGNIZED"
  ) {
    return { ok: false, message: "Invalid classification.status.", field: "classification.status" };
  }
  const classification: PackExtractionClassificationV1 = { status };

  if (status === "CLASSIFIED") {
    if (!isNonEmptyString(value.primary_document_type_id, 128)) {
      return {
        ok: false,
        message: "CLASSIFIED requires primary_document_type_id.",
        field: "classification.primary_document_type_id",
      };
    }
    classification.primary_document_type_id = value.primary_document_type_id.trim();
  }

  if (status === "AMBIGUOUS" || status === "CLASSIFIED" || status === "COMPOUND") {
    if (!Array.isArray(value.candidates) || value.candidates.length === 0) {
      return {
        ok: false,
        message: "classification.candidates must be a non-empty array.",
        field: "classification.candidates",
      };
    }
    const candidates: PackExtractionClassificationCandidateV1[] = [];
    for (let i = 0; i < value.candidates.length; i += 1) {
      const parsed = parseClassificationCandidate(value.candidates[i], i, options);
      if (!parsed.ok) {
        return parsed;
      }
      candidates.push(parsed.value);
    }
    classification.candidates = candidates;
  }

  if (status === "COMPOUND") {
    if (!Array.isArray(value.segments) || value.segments.length === 0) {
      return {
        ok: false,
        message: "COMPOUND requires non-empty segments.",
        field: "classification.segments",
      };
    }
    const segments: PackExtractionClassificationSegmentV1[] = [];
    for (let i = 0; i < value.segments.length; i += 1) {
      const parsed = parseSegment(value.segments[i], i);
      if (!parsed.ok) {
        return parsed;
      }
      segments.push(parsed.value);
    }
    if (segmentsOverlap(segments)) {
      return {
        ok: false,
        message: "COMPOUND segments must not overlap.",
        field: "classification.segments",
      };
    }
    classification.segments = segments;
  }

  if (status === "UNRECOGNIZED") {
    if (hasOwn(value, "primary_document_type_id")) {
      return {
        ok: false,
        message: "UNRECOGNIZED must not include primary_document_type_id.",
        field: "classification.primary_document_type_id",
      };
    }
  }

  return { ok: true, value: classification };
}

function parseMissingFacts(value: unknown): PackExtractionParseResult<PackExtractionMissingFactV1[] | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!Array.isArray(value)) {
    return { ok: false, message: "missing_facts must be an array.", field: "missing_facts" };
  }
  const items: PackExtractionMissingFactV1[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const field = `missing_facts[${i}]`;
    const entry = value[i];
    if (!isRecord(entry)) {
      return { ok: false, message: "missing_facts entry must be an object.", field };
    }
    if (!isNonEmptyString(entry.fact_id, 256)) {
      return { ok: false, message: "fact_id is required.", field: `${field}.fact_id` };
    }
    if (entry.status !== "NOT_FOUND" && entry.status !== "NOT_APPLICABLE") {
      return { ok: false, message: "Invalid missing_facts status.", field: `${field}.status` };
    }
    items.push({ fact_id: entry.fact_id.trim(), status: entry.status });
  }
  return { ok: true, value: items };
}

function parseAmbiguities(
  value: unknown,
  options?: ParsePackExtractionOutputOptionsV1,
): PackExtractionParseResult<PackExtractionAmbiguityV1[] | undefined> {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (!Array.isArray(value)) {
    return { ok: false, message: "ambiguities must be an array.", field: "ambiguities" };
  }
  const items: PackExtractionAmbiguityV1[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const field = `ambiguities[${i}]`;
    const entry = value[i];
    if (!isRecord(entry)) {
      return { ok: false, message: "ambiguity entry must be an object.", field };
    }
    if (!isNonEmptyString(entry.kind, 128)) {
      return { ok: false, message: "kind is required.", field: `${field}.kind` };
    }
    if (!isNonEmptyString(entry.reason_code, 128)) {
      return { ok: false, message: "reason_code is required.", field: `${field}.reason_code` };
    }
    if (!Array.isArray(entry.fact_ids)) {
      return { ok: false, message: "fact_ids must be an array.", field: `${field}.fact_ids` };
    }
    const fact_ids = entry.fact_ids.map((id, j) => {
      if (!isNonEmptyString(id, 256)) {
        throw new Error(`invalid fact_id at ${j}`);
      }
      return id.trim();
    });
    const evidence = parseEvidenceAnchorList(entry.evidence, `${field}.evidence`, options?.window, 1);
    if (!evidence.ok) {
      return evidence;
    }
    items.push({
      kind: entry.kind.trim(),
      fact_ids,
      reason_code: entry.reason_code.trim(),
      evidence: evidence.value,
    });
  }
  return { ok: true, value: items };
}

export function parsePackExtractionOutputV1(
  value: unknown,
  options?: ParsePackExtractionOutputOptionsV1,
): PackExtractionParseResult<PackExtractionOutputV1> {
  if (!isRecord(value)) {
    return { ok: false, message: "Output payload must be a JSON object." };
  }
  if (value.contract_version !== PACK_EXTRACTION_OUTPUT_VERSION) {
    return {
      ok: false,
      message: "Invalid contract_version for pack-extraction-output@1.",
      field: "contract_version",
    };
  }
  if (!isSha256Digest(value.prompt_digest)) {
    return { ok: false, message: "prompt_digest must be sha256:<64 hex>.", field: "prompt_digest" };
  }
  const prompt_digest = normalizeSha256Digest(value.prompt_digest);
  if (options?.expected_prompt_digest && prompt_digest !== normalizeSha256Digest(options.expected_prompt_digest)) {
    return { ok: false, message: "prompt_digest does not match the request.", field: "prompt_digest" };
  }
  if (!isNonEmptyString(value.source_ref_id, 128)) {
    return { ok: false, message: "source_ref_id is required.", field: "source_ref_id" };
  }
  const source_ref_id = value.source_ref_id.trim();
  if (options?.expected_source_ref_id && source_ref_id !== options.expected_source_ref_id.trim()) {
    return { ok: false, message: "source_ref_id does not match the request.", field: "source_ref_id" };
  }
  const classification = parseClassification(value.classification, options);
  if (!classification.ok) {
    return classification;
  }
  if (!Array.isArray(value.records)) {
    return { ok: false, message: "records must be an array.", field: "records" };
  }
  const records: PackExtractionRecordV1[] = [];
  const localIds = new Set<string>();
  for (let i = 0; i < value.records.length; i += 1) {
    const parsed = parseRecord(value.records[i], i, options);
    if (!parsed.ok) {
      return parsed;
    }
    if (localIds.has(parsed.value.record_local_id)) {
      return {
        ok: false,
        message: "record_local_id must be unique within the output.",
        field: `records[${i}].record_local_id`,
      };
    }
    localIds.add(parsed.value.record_local_id);
    records.push(parsed.value);
  }
  let missing_facts: PackExtractionMissingFactV1[] | undefined;
  try {
    const parsedMissing = parseMissingFacts(value.missing_facts);
    if (!parsedMissing.ok) {
      return parsedMissing;
    }
    missing_facts = parsedMissing.value;
  } catch {
    return { ok: false, message: "Invalid missing_facts.fact_id.", field: "missing_facts" };
  }
  let ambiguities: PackExtractionAmbiguityV1[] | undefined;
  try {
    const parsedAmb = parseAmbiguities(value.ambiguities, options);
    if (!parsedAmb.ok) {
      return parsedAmb;
    }
    ambiguities = parsedAmb.value;
  } catch {
    return { ok: false, message: "Invalid ambiguities.fact_ids entry.", field: "ambiguities" };
  }
  const output: PackExtractionOutputV1 = {
    contract_version: PACK_EXTRACTION_OUTPUT_VERSION,
    prompt_digest,
    source_ref_id,
    classification: classification.value,
    records,
  };
  if (missing_facts !== undefined) {
    output.missing_facts = missing_facts;
  }
  if (ambiguities !== undefined) {
    output.ambiguities = ambiguities;
  }
  return { ok: true, value: output };
}
