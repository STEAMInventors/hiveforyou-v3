/** Declarative domain pack manifest (files on disk; not a registry service). */
export const DOMAIN_PACK_MANIFEST_VERSION = "domain-pack-manifest@1" as const;

export type DomainPackMatchSignalsV1 = {
  title_patterns?: string[];
  keywords?: string[];
  section_headers?: string[];
  min_pages?: number;
};

export type DomainPackFieldDefV1 = {
  field_key: string;
  title: string;
  description?: string;
  value_type: "string" | "number" | "date" | "boolean" | "object" | "array";
  required?: boolean;
  reusable?: boolean;
  evidence_required?: boolean;
};

export type DomainPackDocumentTypeV1 = {
  document_type_id: string;
  domain_id: string;
  label: string;
  match: DomainPackMatchSignalsV1;
  structure: {
    fields: DomainPackFieldDefV1[];
  };
};

export type DomainPackDomainV1 = {
  domain_id: string;
  label: string;
  vocabulary_fields?: DomainPackFieldDefV1[];
};

export type DomainPackManifestV1 = {
  contract_version: typeof DOMAIN_PACK_MANIFEST_VERSION;
  pack_id: string;
  pack_version: string;
  review_status: "draft" | "reviewed";
  domains: DomainPackDomainV1[];
  document_types: DomainPackDocumentTypeV1[];
};
