import {
  ALLOWED_UPLOAD_MIME_TYPES,
  type AllowedUploadMimeType,
  type UploadProductPolicyV1,
} from "@hiveforyou/contracts/documents/v1";

function isAllowedMime(value: string): value is AllowedUploadMimeType {
  return (ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(value);
}

export function parseUploadProductPolicyV1(value: unknown): UploadProductPolicyV1 | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const offerRaw = record.commercial_offer;
  if (
    typeof record.max_file_bytes !== "number" ||
    !Number.isFinite(record.max_file_bytes) ||
    typeof record.free_uploads_per_utc_month !== "number" ||
    !Number.isFinite(record.free_uploads_per_utc_month) ||
    !Array.isArray(record.allowed_mime_types) ||
    !offerRaw ||
    typeof offerRaw !== "object"
  ) {
    return null;
  }
  const offer = offerRaw as Record<string, unknown>;
  if (
    typeof offer.upload_count !== "number" ||
    typeof offer.price_cents !== "number" ||
    typeof offer.currency !== "string" ||
    typeof offer.payments_enabled !== "boolean"
  ) {
    return null;
  }
  const allowed_mime_types = record.allowed_mime_types
    .filter((entry): entry is string => typeof entry === "string")
    .filter(isAllowedMime);
  if (allowed_mime_types.length === 0) {
    return null;
  }
  return {
    max_file_bytes: record.max_file_bytes,
    free_uploads_per_utc_month: record.free_uploads_per_utc_month,
    allowed_mime_types,
    commercial_offer: {
      upload_count: offer.upload_count,
      price_cents: offer.price_cents,
      currency: offer.currency,
      payments_enabled: offer.payments_enabled,
    },
  };
}

export function formatMaxFileSizeMb(maxBytes: number): number {
  return Math.round(maxBytes / (1024 * 1024));
}

export function uploadTypeGuidanceLabel(policy: UploadProductPolicyV1): string {
  const mb = formatMaxFileSizeMb(policy.max_file_bytes);
  return `PDF, PNG, JPG, or DOCX — up to ${mb} MB each.`;
}

export function uploadValidationErrorLabel(policy: UploadProductPolicyV1): string {
  const mb = formatMaxFileSizeMb(policy.max_file_bytes);
  return `Only PDF, PNG, JPG, and DOCX files up to ${mb} MB are supported.`;
}

export function buildUploadAcceptAttribute(policy: UploadProductPolicyV1): string {
  const extensions = new Set<string>();
  for (const mime of policy.allowed_mime_types) {
    if (mime === "application/pdf") {
      extensions.add(".pdf");
    } else if (mime === "image/png") {
      extensions.add(".png");
    } else if (mime === "image/jpeg") {
      extensions.add(".jpg");
      extensions.add(".jpeg");
    } else if (
      mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      extensions.add(".docx");
    }
  }
  return [...policy.allowed_mime_types, ...extensions].join(",");
}
