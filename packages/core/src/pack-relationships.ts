import type { NormalizedDomainPackManifest } from "./pack-normalize.js";
import { PackValidationError } from "./pack-validation.js";

export type RelationshipValidationIssue = {
  code: "UNKNOWN_RECORD_TYPE" | "UNKNOWN_DOCUMENT_TYPE" | "INVALID_IDENTITY";
  message: string;
};

export function validatePackRelationships(
  manifest: NormalizedDomainPackManifest,
): RelationshipValidationIssue[] {
  const issues: RelationshipValidationIssue[] = [];
  const recordIds = new Set(
    manifest.record_types?.map((entry) => entry.record_type_id) ?? [],
  );
  const docTypeIds = new Set(manifest.document_types.map((entry) => entry.document_type_id));

  for (const docType of manifest.document_types) {
    const checklist =
      "checklist" in docType && Array.isArray(docType.checklist)
        ? docType.checklist
        : [];
    for (const recordTypeId of checklist) {
      if (!recordIds.has(recordTypeId)) {
        issues.push({
          code: "UNKNOWN_RECORD_TYPE",
          message: `Document type ${docType.document_type_id} references unknown record ${recordTypeId}.`,
        });
      }
    }
    if ("ordering_date_field" in docType && typeof docType.ordering_date_field === "string") {
      const [recordTypeId] = docType.ordering_date_field.split(".");
      if (recordTypeId && !recordIds.has(recordTypeId)) {
        issues.push({
          code: "INVALID_IDENTITY",
          message: `Document type ${docType.document_type_id} ordering_date_field is invalid.`,
        });
      }
    }
  }

  for (const record of manifest.record_types ?? []) {
    for (const keyField of record.identity.key_fields) {
      if (!record.fields.some((field) => field.field_id === keyField)) {
        issues.push({
          code: "INVALID_IDENTITY",
          message: `Record ${record.record_type_id} identity key ${keyField} is not declared.`,
        });
      }
    }
  }

  if (docTypeIds.size !== manifest.document_types.length) {
    issues.push({
      code: "UNKNOWN_DOCUMENT_TYPE",
      message: "Duplicate document_type_id values detected.",
    });
  }

  if (issues.length > 0) {
    return issues;
  }
  return issues;
}

export function assertValidPackRelationships(manifest: NormalizedDomainPackManifest): void {
  const issues = validatePackRelationships(manifest);
  if (issues.length > 0) {
    throw new PackValidationError(issues[0]!.message);
  }
}
