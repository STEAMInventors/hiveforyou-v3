import type { DomainPackFieldDefV1 } from "@hiveforyou/contracts/domain-packs/v1";

import type { NormalizedDomainPackManifest } from "./pack-normalize.js";

function sortById<T extends { [key: string]: unknown }>(
  items: T[],
  idKey: keyof T,
): T[] {
  return [...items].sort((a, b) =>
    String(a[idKey]).localeCompare(String(b[idKey]), undefined, { numeric: true }),
  );
}

function sortStructureFields(fields: DomainPackFieldDefV1[]): DomainPackFieldDefV1[] {
  return [...fields].sort((a, b) => a.field_key.localeCompare(b.field_key, undefined, { numeric: true }));
}

/** Deterministic manifest object for `pack_canonical_digest` (before JCS). */
export function buildCanonicalPackManifest(
  manifest: NormalizedDomainPackManifest,
): Record<string, unknown> {
  const document_types = sortById(manifest.document_types, "document_type_id").map((docType) => {
    const copy = { ...docType } as Record<string, unknown>;
    if (docType.structure?.fields?.length) {
      copy.structure = {
        fields: sortStructureFields(docType.structure.fields),
      };
    }
    return copy;
  });

  const record_types = sortById(manifest.record_types ?? [], "record_type_id").map((record) => ({
    ...record,
    fields: [...record.fields].sort((a, b) =>
      a.field_id.localeCompare(b.field_id, undefined, { numeric: true }),
    ),
  }));

  const body: Record<string, unknown> = {
    contract_version: manifest.contract_version,
    pack_id: manifest.pack_id,
    pack_version: manifest.pack_version,
    review_status: manifest.review_status,
    domains: sortById(manifest.domains, "domain_id"),
    document_types,
  };

  if (manifest.record_types?.length) {
    body.record_types = record_types;
  }
  if (manifest.public_surfaces?.length) {
    body.public_surfaces = sortById(manifest.public_surfaces, "domain_id");
  }
  if (manifest.reading_notes !== undefined) {
    body.reading_notes = manifest.reading_notes;
  }
  if (manifest.constructs !== undefined) {
    body.constructs = manifest.constructs;
  }
  if (manifest.relationship_rules !== undefined) {
    body.relationship_rules = manifest.relationship_rules;
  }
  if (manifest.vocabulary !== undefined) {
    body.vocabulary = manifest.vocabulary;
  }
  if (manifest.plain_explainers !== undefined) {
    body.plain_explainers = manifest.plain_explainers;
  }

  return body;
}
