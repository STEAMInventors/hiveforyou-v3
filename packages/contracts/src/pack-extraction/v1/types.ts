import type { PackExtractionEvidenceAnchorV1, PackExtractionValidationReasonCodeV1 } from "./common.js";

export const PACK_EXTRACTION_INPUT_VERSION = "pack-extraction-input@1" as const;
export const PACK_EXTRACTION_OUTPUT_VERSION = "pack-extraction-output@1" as const;
export const PACK_EXTRACTION_VALIDATION_VERSION = "pack-extraction-validation@1" as const;
export const PACK_EXTRACTION_REF_VERSION = "pack-extraction-ref@1" as const;
export const PACK_EXTRACTION_VALIDATOR_VERSION = "pack-extraction-validator@1" as const;

export type PackExtractionClassificationStatusV1 =
  | "CLASSIFIED"
  | "AMBIGUOUS"
  | "COMPOUND"
  | "UNRECOGNIZED";

export type PackExtractionFactStatusV1 =
  | "OBSERVED"
  | "UNCERTAIN"
  | "NOT_FOUND"
  | "NOT_APPLICABLE";

export type PackExtractionDispositionV1 =
  | "VALID"
  | "VALID_WITH_REJECTIONS"
  | "UNRECOGNIZED"
  | "UNUSABLE";

export type PackExtractionInputSourceRefV1 = {
  source_ref_id: string;
  source_sha256: string;
  read_fingerprint: string;
};

export type PackExtractionInputWindowV1 = {
  page_start: number;
  page_end: number;
  is_partial: boolean;
};

export type PackExtractionInputPageMetaV1 = {
  page_number: number;
  extraction_method: string;
  quality: string;
};

export type PackExtractionInputSourceMetadataV1 = {
  mime_family: string;
  page_count: number;
  window: PackExtractionInputWindowV1;
  pages: PackExtractionInputPageMetaV1[];
};

export type PackExtractionInputPageV1 = {
  page_number: number;
  text: string;
};

export type PackExtractionInputV1 = {
  contract_version: typeof PACK_EXTRACTION_INPUT_VERSION;
  prompt_digest: string;
  source_ref: PackExtractionInputSourceRefV1;
  source_metadata: PackExtractionInputSourceMetadataV1;
  pages: PackExtractionInputPageV1[];
};

export type PackExtractionClassificationCandidateV1 = {
  document_type_id: string;
  rank: number;
  evidence: PackExtractionEvidenceAnchorV1[];
};

export type PackExtractionClassificationSegmentV1 = {
  document_type_id: string;
  page_start: number;
  page_end: number;
};

export type PackExtractionClassificationV1 = {
  status: PackExtractionClassificationStatusV1;
  primary_document_type_id?: string;
  candidates?: PackExtractionClassificationCandidateV1[];
  segments?: PackExtractionClassificationSegmentV1[];
};

export type PackExtractionObservedFactV1 = {
  status: "OBSERVED";
  value: unknown;
  evidence: PackExtractionEvidenceAnchorV1[];
};

export type PackExtractionUncertainFactV1 = {
  status: "UNCERTAIN";
  value: unknown;
  reason_code: string;
  evidence: PackExtractionEvidenceAnchorV1[];
};

export type PackExtractionNotFoundFactV1 = {
  status: "NOT_FOUND";
};

export type PackExtractionNotApplicableFactV1 = {
  status: "NOT_APPLICABLE";
};

export type PackExtractionFactV1 =
  | PackExtractionObservedFactV1
  | PackExtractionUncertainFactV1
  | PackExtractionNotFoundFactV1
  | PackExtractionNotApplicableFactV1;

export type PackExtractionRecordV1 = {
  record_type_id: string;
  record_local_id: string;
  segment_index: number;
  facts: Record<string, PackExtractionFactV1>;
  children: PackExtractionRecordV1[];
};

export type PackExtractionMissingFactV1 = {
  fact_id: string;
  status: "NOT_FOUND" | "NOT_APPLICABLE";
};

export type PackExtractionAmbiguityV1 = {
  kind: string;
  fact_ids: string[];
  reason_code: string;
  evidence: PackExtractionEvidenceAnchorV1[];
};

export type PackExtractionOutputV1 = {
  contract_version: typeof PACK_EXTRACTION_OUTPUT_VERSION;
  prompt_digest: string;
  source_ref_id: string;
  classification: PackExtractionClassificationV1;
  records: PackExtractionRecordV1[];
  missing_facts?: PackExtractionMissingFactV1[];
  ambiguities?: PackExtractionAmbiguityV1[];
};

export type PackExtractionValidationCountsV1 = {
  records: number;
  facts_accepted: number;
  facts_rejected: number;
  records_rejected: number;
};

export type PackExtractionValidationRejectionV1 = {
  path: string;
  reason_code: PackExtractionValidationReasonCodeV1;
};

export type PackExtractionValidationV1 = {
  contract_version: typeof PACK_EXTRACTION_VALIDATION_VERSION;
  disposition: PackExtractionDispositionV1;
  counts: PackExtractionValidationCountsV1;
  rejections: PackExtractionValidationRejectionV1[];
  validator_version: typeof PACK_EXTRACTION_VALIDATOR_VERSION;
};

export type PackExtractionRefV1 = {
  contract_version: typeof PACK_EXTRACTION_REF_VERSION;
  pack_id: string;
  pack_version: string;
  pack_digest: string;
  pack_canonical_digest?: string;
  catalog_digest?: string;
  prompt_template_version: string;
  extraction_rules_version: string;
  output_contract_version: string;
  output_schema_digest?: string;
  prompt_digests: string[];
  partition_plan_digest?: string | null;
};

export type ParsePackExtractionOutputOptionsV1 = {
  expected_prompt_digest?: string;
  expected_source_ref_id?: string;
  window?: { page_start: number; page_end: number };
};
