import {
  PACK_EXTRACTION_OUTPUT_VERSION,
  PACK_EXTRACTION_VALIDATION_VERSION,
  PACK_EXTRACTION_VALIDATOR_VERSION,
  type PackExtractionClassificationStatusV1,
  type PackExtractionDispositionV1,
  type PackExtractionFactStatusV1,
  type PackExtractionValidationReasonCodeV1,
  type PackExtractionValidationRejectionV1,
  type PackExtractionValidationV1,
} from "@hiveforyou/contracts/pack-extraction/v1";
import {
  normalizeQuoteText,
  quoteFoundInPageText,
  type PackCatalogFactDefinition,
  type PackCatalogRecordType,
  type PackFactCatalogBody,
} from "@hiveforyou/core";

export type PackExtractionUnusableReason =
  | "output_not_json"
  | "output_truncated"
  | "contract_mismatch"
  | "classification_invalid";

export type AcceptedPackFactEvidenceV1 = { page_number: number; exact_quote: string };

/** One accepted candidate fact (still unverified until P2.3). */
export type AcceptedPackFactV1 = {
  record_type_id: string;
  record_local_id: string;
  parent_record_local_id: string | null;
  segment_index: number;
  fact_id: string;
  status: PackExtractionFactStatusV1;
  value?: unknown;
  reason_code?: string;
  evidence: AcceptedPackFactEvidenceV1[];
};

export type PackExtractionClassificationSummaryV1 = {
  status: PackExtractionClassificationStatusV1;
  primary_document_type_id: string | null;
  document_type_ids: string[];
};

export type PackExtractionFactIdResolutionCountsV1 = {
  exact: number;
  normalized: number;
};

export type PackExtractionValidationOutcome =
  | {
      usable: true;
      validation: PackExtractionValidationV1;
      classification: PackExtractionClassificationSummaryV1;
      acceptedFacts: AcceptedPackFactV1[];
      factIdResolution: PackExtractionFactIdResolutionCountsV1;
    }
  | {
      usable: false;
      reason: PackExtractionUnusableReason;
      validation: PackExtractionValidationV1;
      classification: null;
      acceptedFacts: [];
    };

export type PackExtractionValidationContext = {
  catalog: PackFactCatalogBody;
  documentTypeIds: ReadonlySet<string>;
  promptDigest: string;
  sourceRefId: string;
  window: { page_start: number; page_end: number };
  /** Reader page text by page number (the same text supplied to the model). */
  pageText: ReadonlyMap<number, string>;
  finishReason: string | null;
};

type CatalogIndex = {
  recordTypes: Map<string, PackCatalogRecordType>;
  factOwner: Map<string, { recordTypeId: string; fact: PackCatalogFactDefinition }>;
};

const QUOTE_MAX_LENGTH = 16_384;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown, maxLen = 4096): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLen;
}

function pointerToken(token: string | number): string {
  return String(token).replace(/~/g, "~0").replace(/\//g, "~1");
}

function indexCatalog(catalog: PackFactCatalogBody): CatalogIndex {
  const recordTypes = new Map<string, PackCatalogRecordType>();
  const factOwner = new Map<string, { recordTypeId: string; fact: PackCatalogFactDefinition }>();
  for (const record of catalog.record_types) {
    recordTypes.set(record.record_type_id, record);
    for (const fact of record.facts) {
      factOwner.set(fact.fact_id, { recordTypeId: record.record_type_id, fact });
    }
  }
  return { recordTypes, factOwner };
}

export type PackCatalogFactIdResolution =
  | { kind: "resolved"; catalogFactId: string; mode: "exact" | "normalized" }
  | { kind: "wrong_record_type"; catalogFactId: string }
  | { kind: "unknown" };

/**
 * Map an emitted facts-map key to a catalog `fact_id` for the containing record type.
 * Exact catalog IDs win; otherwise try `<record_type_id>.<emitted_key>` when catalog-owned.
 */
export function resolvePackCatalogFactId(
  index: CatalogIndex,
  recordTypeId: string,
  emittedKey: string,
): PackCatalogFactIdResolution {
  const exactOwner = index.factOwner.get(emittedKey);
  if (exactOwner) {
    if (exactOwner.recordTypeId !== recordTypeId) {
      return { kind: "wrong_record_type", catalogFactId: emittedKey };
    }
    return { kind: "resolved", catalogFactId: emittedKey, mode: "exact" };
  }
  const prefixedId = `${recordTypeId}.${emittedKey}`;
  const prefixedOwner = index.factOwner.get(prefixedId);
  if (prefixedOwner && prefixedOwner.recordTypeId === recordTypeId) {
    return { kind: "resolved", catalogFactId: prefixedId, mode: "normalized" };
  }
  return { kind: "unknown" };
}

export { normalizeQuoteText } from "@hiveforyou/core";

function unusable(reason: PackExtractionUnusableReason): PackExtractionValidationOutcome {
  return {
    usable: false,
    reason,
    validation: {
      contract_version: PACK_EXTRACTION_VALIDATION_VERSION,
      disposition: "UNUSABLE",
      counts: { records: 0, facts_accepted: 0, facts_rejected: 0, records_rejected: 0 },
      rejections: [],
      validator_version: PACK_EXTRACTION_VALIDATOR_VERSION,
    },
    classification: null,
    acceptedFacts: [],
  };
}

type ClassificationCheck =
  | { ok: true; summary: PackExtractionClassificationSummaryV1; segmentCount: number }
  | { ok: false };

function checkClassification(
  value: unknown,
  ctx: PackExtractionValidationContext,
): ClassificationCheck {
  if (!isRecord(value)) {
    return { ok: false };
  }
  const status = value.status;
  if (
    status !== "CLASSIFIED" &&
    status !== "AMBIGUOUS" &&
    status !== "COMPOUND" &&
    status !== "UNRECOGNIZED"
  ) {
    return { ok: false };
  }

  if (status === "UNRECOGNIZED") {
    if (value.primary_document_type_id !== undefined) {
      return { ok: false };
    }
    return {
      ok: true,
      summary: { status, primary_document_type_id: null, document_type_ids: [] },
      segmentCount: 0,
    };
  }

  const typeIds = new Set<string>();
  let primary: string | null = null;
  if (status === "CLASSIFIED") {
    if (!isNonEmptyString(value.primary_document_type_id, 128)) {
      return { ok: false };
    }
    primary = value.primary_document_type_id.trim();
    if (!ctx.documentTypeIds.has(primary)) {
      return { ok: false };
    }
    typeIds.add(primary);
  }

  if (!Array.isArray(value.candidates) || value.candidates.length === 0) {
    return { ok: false };
  }
  for (const candidate of value.candidates) {
    if (!isRecord(candidate) || !isNonEmptyString(candidate.document_type_id, 128)) {
      return { ok: false };
    }
    const typeId = candidate.document_type_id.trim();
    if (!ctx.documentTypeIds.has(typeId)) {
      return { ok: false };
    }
    typeIds.add(typeId);
  }

  let segmentCount = 1;
  if (status === "COMPOUND") {
    if (!Array.isArray(value.segments) || value.segments.length === 0) {
      return { ok: false };
    }
    const ranges: Array<{ start: number; end: number }> = [];
    for (const segment of value.segments) {
      if (!isRecord(segment) || !isNonEmptyString(segment.document_type_id, 128)) {
        return { ok: false };
      }
      const typeId = segment.document_type_id.trim();
      const start = segment.page_start;
      const end = segment.page_end;
      if (
        !ctx.documentTypeIds.has(typeId) ||
        typeof start !== "number" ||
        typeof end !== "number" ||
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < ctx.window.page_start ||
        end > ctx.window.page_end ||
        end < start
      ) {
        return { ok: false };
      }
      typeIds.add(typeId);
      ranges.push({ start, end });
    }
    ranges.sort((a, b) => a.start - b.start);
    for (let i = 1; i < ranges.length; i += 1) {
      if (ranges[i]!.start <= ranges[i - 1]!.end) {
        return { ok: false };
      }
    }
    segmentCount = ranges.length;
  }

  return {
    ok: true,
    summary: {
      status,
      primary_document_type_id: primary,
      document_type_ids: [...typeIds].sort(),
    },
    segmentCount,
  };
}

function checkValue(
  fact: PackCatalogFactDefinition,
  value: unknown,
): PackExtractionValidationReasonCodeV1 | null {
  if (value === null || value === undefined || Array.isArray(value)) {
    return "TYPE_MISMATCH";
  }
  switch (fact.value_kind) {
    case "text":
    case "date":
      return isNonEmptyString(value, QUOTE_MAX_LENGTH) ? null : "TYPE_MISMATCH";
    case "code":
      if (!isNonEmptyString(value, 256)) {
        return "TYPE_MISMATCH";
      }
      if (fact.enum && fact.enum.length > 0 && !fact.enum.includes(value.trim())) {
        return "ENUM_INVALID";
      }
      return null;
    case "quantity":
      if (typeof value === "number") {
        return Number.isFinite(value) ? null : "TYPE_MISMATCH";
      }
      return isNonEmptyString(value, 256) || isRecord(value) ? null : "TYPE_MISMATCH";
    case "period":
      return isNonEmptyString(value, 1024) || isRecord(value) ? null : "TYPE_MISMATCH";
    default:
      return typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        isRecord(value)
        ? null
        : "TYPE_MISMATCH";
  }
}

type AnchorCheck =
  | { ok: true; anchors: AcceptedPackFactEvidenceV1[] }
  | { ok: false; reason: PackExtractionValidationReasonCodeV1 };

function checkAnchors(value: unknown, ctx: PackExtractionValidationContext): AnchorCheck {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, reason: "MISSING_EVIDENCE" };
  }
  const anchors: AcceptedPackFactEvidenceV1[] = [];
  let firstFailure: PackExtractionValidationReasonCodeV1 | null = null;
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      typeof entry.page_number !== "number" ||
      !Number.isInteger(entry.page_number) ||
      !isNonEmptyString(entry.exact_quote, QUOTE_MAX_LENGTH)
    ) {
      firstFailure ??= "MISSING_EVIDENCE";
      continue;
    }
    const page = entry.page_number;
    if (page < ctx.window.page_start || page > ctx.window.page_end || !ctx.pageText.has(page)) {
      firstFailure ??= "PAGE_OUT_OF_RANGE";
      continue;
    }
    const pageText = ctx.pageText.get(page) ?? "";
    if (!quoteFoundInPageText(pageText, entry.exact_quote)) {
      firstFailure ??= "QUOTE_NOT_IN_PAGE";
      continue;
    }
    anchors.push({ page_number: page, exact_quote: entry.exact_quote });
  }
  if (anchors.length === 0) {
    return { ok: false, reason: firstFailure ?? "MISSING_EVIDENCE" };
  }
  return { ok: true, anchors };
}

type WalkState = {
  ctx: PackExtractionValidationContext;
  index: CatalogIndex;
  segmentCount: number;
  rejections: PackExtractionValidationRejectionV1[];
  accepted: AcceptedPackFactV1[];
  localIds: Set<string>;
  recordsAccepted: number;
  recordsRejected: number;
  factsRejected: number;
  factIdsExact: number;
  factIdsNormalized: number;
};

function reject(state: WalkState, path: string, reason: PackExtractionValidationReasonCodeV1): void {
  state.rejections.push({ path, reason_code: reason });
}

function validateFact(
  state: WalkState,
  path: string,
  recordTypeId: string,
  emittedKey: string,
  raw: unknown,
  base: Omit<AcceptedPackFactV1, "fact_id" | "status" | "evidence">,
): void {
  const resolved = resolvePackCatalogFactId(state.index, recordTypeId, emittedKey);
  if (resolved.kind === "unknown") {
    reject(state, path, "UNKNOWN_FACT_ID");
    state.factsRejected += 1;
    return;
  }
  if (resolved.kind === "wrong_record_type") {
    reject(state, path, "FACT_NOT_IN_RECORD_TYPE");
    state.factsRejected += 1;
    return;
  }
  const factId = resolved.catalogFactId;
  const owner = state.index.factOwner.get(factId)!;
  if (resolved.mode === "exact") {
    state.factIdsExact += 1;
  } else {
    state.factIdsNormalized += 1;
  }
  if (!isRecord(raw)) {
    reject(state, path, "TYPE_MISMATCH");
    state.factsRejected += 1;
    return;
  }
  const status = raw.status;
  if (status === "NOT_FOUND" || status === "NOT_APPLICABLE") {
    if (raw.value !== undefined) {
      reject(state, path, "VALUE_WITH_NON_OBSERVED_STATUS");
      state.factsRejected += 1;
      return;
    }
    state.accepted.push({ ...base, fact_id: factId, status, evidence: [] });
    return;
  }
  if (status !== "OBSERVED" && status !== "UNCERTAIN") {
    reject(state, path, "TYPE_MISMATCH");
    state.factsRejected += 1;
    return;
  }
  if (status === "UNCERTAIN" && !isNonEmptyString(raw.reason_code, 128)) {
    reject(state, path, "TYPE_MISMATCH");
    state.factsRejected += 1;
    return;
  }
  const valueIssue = checkValue(owner.fact, raw.value);
  if (valueIssue) {
    reject(state, path, valueIssue);
    state.factsRejected += 1;
    return;
  }
  const anchors = checkAnchors(raw.evidence, state.ctx);
  if (!anchors.ok) {
    reject(state, path, anchors.reason);
    state.factsRejected += 1;
    return;
  }
  const accepted: AcceptedPackFactV1 = {
    ...base,
    fact_id: factId,
    status,
    value: raw.value,
    evidence: anchors.anchors,
  };
  if (status === "UNCERTAIN") {
    accepted.reason_code = (raw.reason_code as string).trim();
  }
  state.accepted.push(accepted);
}

function validateRecordList(
  state: WalkState,
  records: unknown[],
  basePath: string,
  parentLocalId: string | null,
): void {
  const nonRepeatableSeen = new Set<string>();
  records.forEach((raw, i) => {
    const path = `${basePath}/${i}`;
    if (!isRecord(raw) || !isNonEmptyString(raw.record_type_id, 128)) {
      reject(state, path, "UNKNOWN_RECORD_TYPE");
      state.recordsRejected += 1;
      return;
    }
    const recordTypeId = raw.record_type_id.trim();
    const recordType = state.index.recordTypes.get(recordTypeId);
    if (!recordType) {
      reject(state, path, "UNKNOWN_RECORD_TYPE");
      state.recordsRejected += 1;
      return;
    }
    const segmentIndex = raw.segment_index;
    if (
      typeof segmentIndex !== "number" ||
      !Number.isInteger(segmentIndex) ||
      segmentIndex < 0 ||
      segmentIndex >= Math.max(1, state.segmentCount)
    ) {
      reject(state, path, "SEGMENT_REF_INVALID");
      state.recordsRejected += 1;
      return;
    }
    if (
      !isNonEmptyString(raw.record_local_id, 128) ||
      state.localIds.has(raw.record_local_id.trim()) ||
      !isRecord(raw.facts) ||
      (raw.children !== undefined && !Array.isArray(raw.children))
    ) {
      reject(state, path, "TYPE_MISMATCH");
      state.recordsRejected += 1;
      return;
    }
    if (!recordType.repeatable) {
      const key = `${segmentIndex}:${recordTypeId}`;
      if (nonRepeatableSeen.has(key)) {
        reject(state, path, "DUPLICATE_NON_REPEATABLE_RECORD");
        state.recordsRejected += 1;
        return;
      }
      nonRepeatableSeen.add(key);
    }

    const localId = raw.record_local_id.trim();
    state.localIds.add(localId);
    state.recordsAccepted += 1;

    const base = {
      record_type_id: recordTypeId,
      record_local_id: localId,
      parent_record_local_id: parentLocalId,
      segment_index: segmentIndex,
    };
    for (const factId of Object.keys(raw.facts).sort()) {
      validateFact(
        state,
        `${path}/facts/${pointerToken(factId)}`,
        recordTypeId,
        factId,
        raw.facts[factId],
        base,
      );
    }
    if (Array.isArray(raw.children) && raw.children.length > 0) {
      validateRecordList(state, raw.children, `${path}/children`, localId);
    }
  });
}

/**
 * Deterministic fact-level validation of untrusted `pack-extraction-output@1` JSON
 * (design §8). Envelope defects make the document UNUSABLE; record/fact defects are
 * rejected individually and every other candidate is preserved.
 */
export function validatePackExtractionOutput(
  raw: unknown,
  ctx: PackExtractionValidationContext,
): PackExtractionValidationOutcome {
  if (ctx.finishReason === "length") {
    return unusable("output_truncated");
  }
  if (!isRecord(raw)) {
    return unusable("output_not_json");
  }
  if (
    raw.contract_version !== PACK_EXTRACTION_OUTPUT_VERSION ||
    typeof raw.prompt_digest !== "string" ||
    raw.prompt_digest.toLowerCase() !== ctx.promptDigest.toLowerCase() ||
    raw.source_ref_id !== ctx.sourceRefId ||
    !Array.isArray(raw.records)
  ) {
    return unusable("contract_mismatch");
  }
  const classification = checkClassification(raw.classification, ctx);
  if (!classification.ok) {
    return unusable("classification_invalid");
  }

  const state: WalkState = {
    ctx,
    index: indexCatalog(ctx.catalog),
    segmentCount: classification.segmentCount,
    rejections: [],
    accepted: [],
    localIds: new Set(),
    recordsAccepted: 0,
    recordsRejected: 0,
    factsRejected: 0,
    factIdsExact: 0,
    factIdsNormalized: 0,
  };

  let disposition: PackExtractionDispositionV1;
  if (classification.summary.status === "UNRECOGNIZED") {
    disposition = "UNRECOGNIZED";
  } else {
    validateRecordList(state, raw.records, "/records", null);
    disposition = state.rejections.length > 0 ? "VALID_WITH_REJECTIONS" : "VALID";
  }

  return {
    usable: true,
    validation: {
      contract_version: PACK_EXTRACTION_VALIDATION_VERSION,
      disposition,
      counts: {
        records: state.recordsAccepted,
        facts_accepted: state.accepted.length,
        facts_rejected: state.factsRejected,
        records_rejected: state.recordsRejected,
      },
      rejections: state.rejections,
      validator_version: PACK_EXTRACTION_VALIDATOR_VERSION,
    },
    classification: classification.summary,
    acceptedFacts: state.accepted,
    factIdResolution: {
      exact: state.factIdsExact,
      normalized: state.factIdsNormalized,
    },
  };
}
