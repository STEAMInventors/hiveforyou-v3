import {
  DOMAIN_PACK_MANIFEST_VERSION,
  type DomainPackManifestV1,
} from "@hiveforyou/contracts/domain-packs/v1";

export class PackValidationError extends Error {
  constructor(
    message: string,
    readonly code: "INVALID_REQUEST" | "EXTRACTION_FAILED" = "INVALID_REQUEST",
  ) {
    super(message);
    this.name = "PackValidationError";
  }
}

export function parsePackManifest(raw: unknown): DomainPackManifestV1 {
  if (!raw || typeof raw !== "object") {
    throw new PackValidationError("Pack manifest must be a JSON object.");
  }
  const manifest = raw as DomainPackManifestV1;
  if (manifest.contract_version !== DOMAIN_PACK_MANIFEST_VERSION) {
    throw new PackValidationError("Unsupported domain pack contract version.");
  }
  if (!manifest.pack_id?.trim() || !manifest.pack_version?.trim()) {
    throw new PackValidationError("Pack manifest requires pack_id and pack_version.");
  }
  if (!Array.isArray(manifest.domains) || !Array.isArray(manifest.document_types)) {
    throw new PackValidationError("Pack manifest requires domains and document_types arrays.");
  }
  for (const docType of manifest.document_types) {
    if (!docType.document_type_id || !docType.domain_id || !docType.structure?.fields) {
      throw new PackValidationError("Each document_type requires ids and structure.fields.");
    }
  }
  return manifest;
}
