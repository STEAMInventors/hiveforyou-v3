import {
  DOMAIN_PACK_MANIFEST_V2,
  type DomainPackManifestV2,
  isDomainPackManifestV2,
} from "@hiveforyou/contracts/domain-packs/v2";
import type {
  DomainPackDocumentTypeV1,
  DomainPackFieldDefV1,
  DomainPackManifestV1,
} from "@hiveforyou/contracts/domain-packs/v1";

import { PackValidationError } from "./pack-validation.js";

export type NormalizedDomainPackManifest = Omit<DomainPackManifestV1, "contract_version"> & {
  contract_version:
    | DomainPackManifestV1["contract_version"]
    | DomainPackManifestV2["contract_version"];
  record_types?: DomainPackManifestV2["record_types"];
  reading_notes?: DomainPackManifestV2["reading_notes"];
  constructs?: DomainPackManifestV2["constructs"];
  relationship_rules?: DomainPackManifestV2["relationship_rules"];
  public_surfaces?: DomainPackManifestV2["public_surfaces"];
  vocabulary?: DomainPackManifestV2["vocabulary"];
  plain_explainers?: DomainPackManifestV2["plain_explainers"];
};

function valueKindToValueType(kind: string): DomainPackFieldDefV1["value_type"] {
  switch (kind) {
    case "text":
    case "code":
      return "string";
    case "number":
      return "number";
    case "date":
      return "date";
    case "boolean":
      return "boolean";
    default:
      return "object";
  }
}

function fieldsFromChecklist(manifest: DomainPackManifestV2): DomainPackDocumentTypeV1[] {
  const recordById = new Map(
    manifest.record_types.map((record) => [record.record_type_id, record]),
  );

  return manifest.document_types.map((docType) => {
    if (docType.structure?.fields?.length) {
      return docType as DomainPackDocumentTypeV1;
    }
    const checklist = docType.checklist ?? [];
    const fields: DomainPackFieldDefV1[] = [];
    for (const recordTypeId of checklist) {
      const record = recordById.get(recordTypeId);
      if (!record) {
        continue;
      }
      fields.push({
        field_key: recordTypeId,
        title: record.label,
        description: record.description,
        value_type: record.repeatable ? "array" : "object",
        required: recordTypeId === "document_header" || recordTypeId === "student",
        reusable: recordTypeId === "student",
        evidence_required: true,
      });
    }
    return {
      ...docType,
      structure: { fields },
    };
  });
}

/** Normalize v2 manifests to the v1 planning surface while retaining v2 metadata. */
export function normalizeDomainPackManifest(
  manifest: DomainPackManifestV1 | DomainPackManifestV2,
): NormalizedDomainPackManifest {
  if (!isDomainPackManifestV2(manifest)) {
    return manifest;
  }
  if (!manifest.public_surfaces?.length) {
    throw new PackValidationError("V2 pack requires public_surfaces.");
  }
  if (!manifest.record_types?.length) {
    throw new PackValidationError("V2 pack requires record_types.");
  }
  for (const record of manifest.record_types) {
    if (!record.record_type_id || !record.fields?.length) {
      throw new PackValidationError("Each record_type requires id and fields.");
    }
  }

  return {
    contract_version: manifest.contract_version,
    pack_id: manifest.pack_id,
    pack_version: manifest.pack_version,
    review_status: manifest.review_status,
    domains: manifest.domains,
    document_types: fieldsFromChecklist(manifest),
    record_types: manifest.record_types,
    reading_notes: manifest.reading_notes,
    constructs: manifest.constructs,
    relationship_rules: manifest.relationship_rules,
    public_surfaces: manifest.public_surfaces,
    vocabulary: manifest.vocabulary,
    plain_explainers: manifest.plain_explainers,
  };
}

export function recordNestedFieldIds(
  manifest: NormalizedDomainPackManifest,
  recordTypeId: string,
): string[] {
  const record = manifest.record_types?.find(
    (entry) => entry.record_type_id === recordTypeId,
  );
  if (!record) {
    return [];
  }
  return record.fields.map((field) => field.field_id);
}

export function mapRecordFieldValueKind(
  manifest: NormalizedDomainPackManifest,
  recordTypeId: string,
  fieldId: string,
): DomainPackFieldDefV1["value_type"] {
  const record = manifest.record_types?.find(
    (entry) => entry.record_type_id === recordTypeId,
  );
  const field = record?.fields.find((entry) => entry.field_id === fieldId);
  return field ? valueKindToValueType(field.value_kind) : "string";
}
