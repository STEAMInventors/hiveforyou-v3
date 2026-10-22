import type { DomainPackFieldDefV1 } from "../../domain-packs/v1/types.js";

export const DOCUMENT_CLASSIFICATION_VERSION = "document-classification@1" as const;
export const EXTRACTION_SCHEMA_VERSION = "extraction-schema@1" as const;
export const READER_CANDIDATE_EXTRACTION_VERSION = "reader-candidate-extraction@1" as const;

export type MatchTierV1 = "exact" | "partial" | "generic";

export type ClassificationCandidateV1 = {
  domain_id: string | null;
  document_type_id: string | null;
  pack_id: string | null;
  score: number;
};

export type DocumentClassificationV1 = {
  contract_version: typeof DOCUMENT_CLASSIFICATION_VERSION;
  source_document_id: string;
  chosen: ClassificationCandidateV1;
  candidates: ClassificationCandidateV1[];
  ambiguity_notes: string[];
  classification_quality: "high" | "medium" | "low";
  detected_sections: { label: string; page_start: number; page_end: number }[];
};

export type ExtractionSchemaFieldV1 = DomainPackFieldDefV1 & {
  required_for_intent?: boolean;
};

export type ExtractionSchemaProvenanceV1 = {
  match_tier: MatchTierV1;
  pack_id: string | null;
  pack_version: string | null;
  pack_digest: string | null;
  document_type_id: string | null;
  domain_id: string | null;
};

export type ExtractionSchemaV1 = {
  contract_version: typeof EXTRACTION_SCHEMA_VERSION;
  extraction_schema_id: string;
  schema_hash: string;
  intent_text: string;
  fields: ExtractionSchemaFieldV1[];
  provenance: ExtractionSchemaProvenanceV1;
  generic: boolean;
};

export type CandidateEvidenceV1 = {
  page_number: number;
  exact_quote: string;
  quote_verified: boolean;
};

export type CandidateFieldStatusV1 =
  | "observed"
  | "missing"
  | "unknown"
  | "unreadable";

export type CandidateFieldV1 = {
  field_key: string;
  value_json: Record<string, unknown> | null;
  status: CandidateFieldStatusV1;
  evidence: CandidateEvidenceV1[];
  issues?: string[];
};

export type ReusableSourceFactV1 = {
  fact_key: string;
  kind: "observed" | "classification";
  value_json: Record<string, unknown>;
  evidence: CandidateEvidenceV1[];
};

export type FieldCoverageV1 = {
  populated: number;
  missing: number;
  unknown: number;
  unreadable: number;
};

export type ReaderCandidateExtractionV1 = {
  contract_version: typeof READER_CANDIDATE_EXTRACTION_VERSION;
  extraction_schema_id: string;
  schema_hash: string;
  candidates: CandidateFieldV1[];
  reusable_source_facts: ReusableSourceFactV1[];
  field_coverage: FieldCoverageV1;
  extract_fingerprint: string;
};
