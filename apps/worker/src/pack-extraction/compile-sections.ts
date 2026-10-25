import type { DomainPackDocumentTypeV2 } from "@hiveforyou/contracts/domain-packs/v2";
import {
  assertValidPackRelationships,
  type NormalizedDomainPackManifest,
  type PackFactCatalogResult,
  serializePackJcs,
} from "@hiveforyou/core";

import { PackPromptCompileError } from "./errors.js";

function isDocumentTypeV2(
  docType: NormalizedDomainPackManifest["document_types"][number],
): docType is DomainPackDocumentTypeV2 {
  return "checklist" in docType || "ordering_date_field" in docType;
}

function resolveReadingNote(
  manifest: NormalizedDomainPackManifest,
  documentTypeId: string,
): string | undefined {
  const note = manifest.reading_notes?.by_document_type?.[documentTypeId];
  return note?.trim() ? note.trim() : undefined;
}

export function buildDomainPackSection(
  manifest: NormalizedDomainPackManifest,
  catalog: PackFactCatalogResult,
): Record<string, unknown> {
  const domain = manifest.domains[0];
  if (!domain) {
    throw new PackPromptCompileError("Domain pack is missing domains.", [
      { code: "PROMPT_COMPILE_FAILED", message: "Missing domains entry." },
    ]);
  }

  const section: Record<string, unknown> = {
    pack_id: manifest.pack_id,
    pack_version: manifest.pack_version,
    pack_canonical_digest: catalog.pack_canonical_digest,
    domain: {
      domain_id: domain.domain_id,
      label: domain.label,
    },
  };

  const globalGuidance = manifest.reading_notes?.global?.trim();
  if (globalGuidance) {
    section.extraction_guidance = globalGuidance;
  }

  return section;
}

export function buildDocumentTaxonomySection(
  manifest: NormalizedDomainPackManifest,
): unknown[] {
  const recordIds = new Set((manifest.record_types ?? []).map((r) => r.record_type_id));

  return [...manifest.document_types]
    .sort((a, b) =>
      a.document_type_id.localeCompare(b.document_type_id, undefined, { numeric: true }),
    )
    .map((docType) => {
      const entry: Record<string, unknown> = {
        document_type_id: docType.document_type_id,
        domain_id: docType.domain_id,
        label: docType.label,
        description: docType.label,
        match: docType.match,
      };

      if (isDocumentTypeV2(docType)) {
        if (docType.author_role !== undefined) {
          entry.author_role = docType.author_role;
        }
        if (docType.checklist !== undefined) {
          for (const recordTypeId of docType.checklist) {
            if (!recordIds.has(recordTypeId)) {
              throw new PackPromptCompileError("Unresolved checklist reference.", [
                {
                  code: "CHECKLIST_UNRESOLVED",
                  document_type_id: docType.document_type_id,
                  record_type_id: recordTypeId,
                  message: `Document type ${docType.document_type_id} checklist references unknown record ${recordTypeId}.`,
                },
              ]);
            }
          }
          entry.checklist = [...docType.checklist];
        }
        if (docType.checklist_policy !== undefined) {
          entry.checklist_policy = docType.checklist_policy;
        }
        if (docType.classification_policy !== undefined) {
          entry.classification_policy = docType.classification_policy;
        }
        if (docType.ordering_date_field !== undefined) {
          entry.ordering_date_field = docType.ordering_date_field;
        }
        if (docType.document_links !== undefined) {
          entry.document_links = [...docType.document_links];
        }
      }

      const readingNote = resolveReadingNote(manifest, docType.document_type_id);
      if (readingNote) {
        entry.reading_note = readingNote;
      }

      return entry;
    });
}

export function buildFactCatalogSection(
  manifest: NormalizedDomainPackManifest,
  catalog: PackFactCatalogResult,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    pack_id: catalog.catalog.pack_id,
    pack_version: catalog.catalog.pack_version,
    catalog_body_digest: catalog.catalog_body_digest,
    record_types: catalog.catalog.record_types,
  };

  if (manifest.constructs !== undefined) {
    body.constructs = manifest.constructs;
  }
  if (manifest.relationship_rules !== undefined) {
    body.relationship_rules = manifest.relationship_rules;
  }

  return body;
}

export function assertPackRelationshipsForCompile(manifest: NormalizedDomainPackManifest): void {
  try {
    assertValidPackRelationships(manifest);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pack relationship validation failed.";
    throw new PackPromptCompileError(message, [
      { code: "CHECKLIST_UNRESOLVED", message },
    ]);
  }
}

export function serializePromptSection(value: unknown): string {
  try {
    return serializePackJcs(value);
  } catch {
    throw new PackPromptCompileError("Canonical serialization failed.", [
      { code: "CANONICALIZATION_FAILED", message: "JCS serialization failed for a prompt section." },
    ]);
  }
}
