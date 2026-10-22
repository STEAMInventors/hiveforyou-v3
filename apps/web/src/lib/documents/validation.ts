import type {
  AllowedUploadMimeType,
  UploadProductPolicyV1,
} from "@hiveforyou/contracts/documents/v1";

import { formatMaxFileSizeMb } from "@/lib/documents/upload-policy";

export function normalizeUploadMimeType(
  file: File,
  allowed: readonly AllowedUploadMimeType[],
): AllowedUploadMimeType | null {
  const allowedSet = new Set<string>(allowed);
  const type = file.type.trim().toLowerCase();
  if (allowedSet.has(type)) {
    return type as AllowedUploadMimeType;
  }
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf") && allowedSet.has("application/pdf")) {
    return "application/pdf";
  }
  if (lower.endsWith(".png") && allowedSet.has("image/png")) {
    return "image/png";
  }
  if ((lower.endsWith(".jpg") || lower.endsWith(".jpeg")) && allowedSet.has("image/jpeg")) {
    return "image/jpeg";
  }
  if (
    lower.endsWith(".docx") &&
    allowedSet.has("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
  ) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return null;
}

export function validateUploadFile(
  file: File,
  policy: UploadProductPolicyV1,
): { ok: true; mime_type: AllowedUploadMimeType } | { ok: false; message: string } {
  const mime_type = normalizeUploadMimeType(file, policy.allowed_mime_types);
  if (!mime_type) {
    return {
      ok: false,
      message: "Only PDF, PNG, JPG, and DOCX files are supported.",
    };
  }
  const maxBytes = policy.max_file_bytes;
  if (file.size <= 0 || file.size > maxBytes) {
    const mb = formatMaxFileSizeMb(maxBytes);
    return {
      ok: false,
      message: `Each file must be between 1 byte and ${mb} MB.`,
    };
  }
  if (!file.name.trim()) {
    return { ok: false, message: "File name is required." };
  }
  return { ok: true, mime_type };
}

export function validateUploadFieldsAgainstPolicy(
  policy: UploadProductPolicyV1,
  mimeType: string,
  byteSize: number,
): { ok: true } | { ok: false; message: string } {
  const allowed = new Set<string>(policy.allowed_mime_types);
  if (!allowed.has(mimeType.trim())) {
    return { ok: false, message: "This file type is not supported." };
  }
  if (!Number.isFinite(byteSize) || byteSize <= 0 || byteSize > policy.max_file_bytes) {
    return { ok: false, message: "File size is outside the allowed limit." };
  }
  return { ok: true };
}

export function parseClientRequestId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length < 8 || trimmed.length > 128) {
    return null;
  }
  return trimmed;
}

export function parseSha256(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}
