import {
  DOMAIN_PACK_MANIFEST_VERSION,
  type DomainPackManifestV1,
} from "@hiveforyou/contracts/domain-packs/v1";
import {
  DOMAIN_PACK_MANIFEST_V2,
  type DomainPackManifestV2,
} from "@hiveforyou/contracts/domain-packs/v2";
import { DOMAIN_PACK_MANIFEST_V3 } from "@hiveforyou/contracts/domain-packs/v3";

export class PackValidationError extends Error {
  constructor(
    message: string,
    readonly code: "INVALID_REQUEST" | "EXTRACTION_FAILED" = "INVALID_REQUEST",
  ) {
    super(message);
    this.name = "PackValidationError";
  }
}

export function parsePackManifest(
  raw: unknown,
): DomainPackManifestV1 | DomainPackManifestV2 {
  if (!raw || typeof raw !== "object") {
    throw new PackValidationError("Pack manifest must be a JSON object.");
  }
  const version =
    typeof raw === "object" && raw !== null && "contract_version" in raw
      ? String((raw as { contract_version: unknown }).contract_version)
      : "";
  if (version === DOMAIN_PACK_MANIFEST_V3) {
    throw new PackValidationError(
      "domain-pack-manifest@3 must be loaded via the explicit v3 candidate pin loader.",
    );
  }
  const manifest = raw as DomainPackManifestV1 | DomainPackManifestV2;
  if (
    manifest.contract_version !== DOMAIN_PACK_MANIFEST_VERSION &&
    manifest.contract_version !== DOMAIN_PACK_MANIFEST_V2
  ) {
    throw new PackValidationError("Unsupported domain pack contract version.");
  }
  if (!manifest.pack_id?.trim() || !manifest.pack_version?.trim()) {
    throw new PackValidationError("Pack manifest requires pack_id and pack_version.");
  }
  if (!Array.isArray(manifest.domains) || !Array.isArray(manifest.document_types)) {
    throw new PackValidationError("Pack manifest requires domains and document_types arrays.");
  }
  if (manifest.contract_version === DOMAIN_PACK_MANIFEST_V2) {
    const v2 = manifest as DomainPackManifestV2;
    if (!Array.isArray(v2.public_surfaces) || v2.public_surfaces.length < 1) {
      throw new PackValidationError("V2 pack requires public_surfaces.");
    }
    if (!Array.isArray(v2.record_types) || v2.record_types.length < 1) {
      throw new PackValidationError("V2 pack requires record_types.");
    }
    for (const docType of v2.document_types) {
      if (!docType.document_type_id || !docType.domain_id || !docType.match) {
        throw new PackValidationError("Each document_type requires ids and match signals.");
      }
      const hasStructure = Boolean(docType.structure?.fields?.length);
      const hasChecklist = Boolean(docType.checklist?.length);
      if (!hasStructure && !hasChecklist) {
        throw new PackValidationError(
          "Each v2 document_type requires structure.fields or checklist.",
        );
      }
    }
    return v2;
  }

  for (const docType of manifest.document_types) {
    if (!docType.document_type_id || !docType.domain_id || !docType.structure?.fields) {
      throw new PackValidationError("Each document_type requires ids and structure.fields.");
    }
  }
  return manifest as DomainPackManifestV1;
}
