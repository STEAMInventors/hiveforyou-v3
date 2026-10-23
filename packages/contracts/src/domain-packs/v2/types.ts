import type {
  DomainPackDocumentTypeV1,
  DomainPackDomainV1,
  DomainPackFieldDefV1,
  DomainPackManifestV1,
  DomainPackMatchSignalsV1,
} from "../v1/types.js";

/** Declarative domain pack manifest (V2 — nested records, public metadata, V2 taxonomy). */
export const DOMAIN_PACK_MANIFEST_V2 = "domain-pack-manifest@2" as const;

export type DomainPackMatchSignalsV2 = DomainPackMatchSignalsV1 & {
  /** Matched only against title/filename zone (higher weight). */
  title_only_patterns?: string[];
  /** Body text keywords (exclude title zone when title_only_patterns hit elsewhere). */
  body_keywords?: string[];
  /** Reduce score when these appear (disambiguation). */
  negative_keywords?: string[];
  filename_patterns?: string[];
  /** Higher wins within-domain ties (more specific types). */
  disambiguation_priority?: number;
};

export type DomainPackRecordFieldV2 = {
  field_id: string;
  value_kind: string;
  description?: string;
  sensitive?: boolean;
  enum?: string[];
};

export type DomainPackRecordIdentityV2 = {
  scope: "document" | "case";
  key_fields: string[];
  key_fields_if_present?: string[];
  disambiguators?: string[];
  version_axis?: string;
  case_singleton_merge?: string;
  cross_document_merge?: string;
};

export type DomainPackRecordTypeV2 = {
  record_type_id: string;
  label: string;
  group?: string;
  repeatable: boolean;
  identity: DomainPackRecordIdentityV2;
  fields: DomainPackRecordFieldV2[];
  description?: string;
};

export type DomainPackDocumentTypeV2 = Omit<
  DomainPackDocumentTypeV1,
  "match" | "document_type_id"
> & {
  document_type_id: string;
  match: DomainPackMatchSignalsV2;
  checklist?: string[];
  checklist_policy?: string;
  document_links?: string[];
  classification_policy?: string;
  ordering_date_field?: string;
  author_role?: string;
};

export type DomainPackPublicSurfaceV2 = {
  domain_id: string;
  label: string;
  short_label?: string;
  front_page: {
    executable: boolean;
    placeholder?: string;
    /** CSS token suffix only — styling lives in CSS, not app branching. */
    pill_tone?: string;
  };
  starter_suggestions?: { title: string; fill: string }[];
};

export type DomainPackReadingNotesV2 = {
  global?: string;
  by_document_type?: Record<string, string>;
};

export type DomainPackManifestV2 = {
  contract_version: typeof DOMAIN_PACK_MANIFEST_V2;
  pack_id: string;
  pack_version: string;
  review_status: "draft" | "reviewed";
  supersedes?: string;
  jurisdictions?: string[];
  public_surfaces: DomainPackPublicSurfaceV2[];
  domains: DomainPackDomainV1[];
  document_types: DomainPackDocumentTypeV2[];
  record_types: DomainPackRecordTypeV2[];
  constructs?: Record<string, unknown>;
  relationship_rules?: Record<string, unknown>;
  reading_notes?: DomainPackReadingNotesV2;
  plain_explainers?: Record<string, unknown>;
  vocabulary?: Record<string, unknown>;
};

export type DomainPackManifestAny = DomainPackManifestV1 | DomainPackManifestV2;

export function isDomainPackManifestV2(
  manifest: DomainPackManifestAny,
): manifest is DomainPackManifestV2 {
  return manifest.contract_version === DOMAIN_PACK_MANIFEST_V2;
}
