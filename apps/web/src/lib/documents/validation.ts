import {
  ALLOWED_UPLOAD_MIME_TYPES,
  UPLOAD_MAX_BYTES_DEFAULT,
  type AllowedUploadMimeType,
} from "@hiveforyou/contracts/documents/v1";

export function readUploadMaxBytes(): number {
  const raw = process.env.UPLOAD_MAX_FILE_BYTES?.trim();
  if (!raw) {
    return UPLOAD_MAX_BYTES_DEFAULT;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return UPLOAD_MAX_BYTES_DEFAULT;
  }
  return parsed;
}

export function normalizeUploadMimeType(file: File): AllowedUploadMimeType | null {
  const type = file.type.trim().toLowerCase();
  if ((ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(type)) {
    return type as AllowedUploadMimeType;
  }
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return null;
}

export function validateUploadFile(
  file: File,
  maxBytes: number = readUploadMaxBytes(),
): { ok: true; mime_type: AllowedUploadMimeType } | { ok: false; message: string } {
  const mime_type = normalizeUploadMimeType(file);
  if (!mime_type) {
    return {
      ok: false,
      message: "Only PDF, PNG, JPG, and DOCX files are supported.",
    };
  }
  if (file.size <= 0 || file.size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
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
