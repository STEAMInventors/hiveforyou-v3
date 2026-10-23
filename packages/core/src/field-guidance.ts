import type { ExtractionFieldGuidanceV1 } from "@hiveforyou/contracts/extraction/v1";

import {
  normalizeDomainPackManifest,
  recordNestedFieldIds,
  type NormalizedDomainPackManifest,
} from "./pack-normalize.js";
import type { DomainPackManifestV1 } from "@hiveforyou/contracts/domain-packs/v1";
import type { DomainPackManifestV2 } from "@hiveforyou/contracts/domain-packs/v2";

export function buildFieldGuidanceForDocumentType(
  manifest: NormalizedDomainPackManifest | DomainPackManifestV1 | DomainPackManifestV2,
  documentTypeId: string,
): ExtractionFieldGuidanceV1[] {
  const normalized: NormalizedDomainPackManifest =
    "document_types" in manifest &&
    "domains" in manifest &&
    "contract_version" in manifest
      ? normalizeDomainPackManifest(manifest as DomainPackManifestV1 | DomainPackManifestV2)
      : (manifest as NormalizedDomainPackManifest);
  const docType = normalized.document_types.find(
    (entry) => entry.document_type_id === documentTypeId,
  );
  if (!docType) {
    return [];
  }
  const readingByType = normalized.reading_notes?.by_document_type ?? {};
  const docReadingNote = readingByType[documentTypeId];
  const checklist =
    "checklist" in docType && Array.isArray(docType.checklist)
      ? docType.checklist
      : docType.structure.fields.map((field) => field.field_key);

  const guidance: ExtractionFieldGuidanceV1[] = [];
  for (const recordTypeId of checklist) {
    const record = normalized.record_types?.find(
      (entry) => entry.record_type_id === recordTypeId,
    );
    if (!record) {
      continue;
    }
    guidance.push({
      record_type_id: recordTypeId,
      repeatable: record.repeatable,
      nested_field_ids: recordNestedFieldIds(normalized, recordTypeId),
      reading_note: docReadingNote ?? normalized.reading_notes?.global,
      identity_key_fields: record.identity.key_fields,
    });
  }
  return guidance;
}
