import { ErrorCategory, ErrorCode } from "@hiveforyou/contracts/errors/v1";

import { jsonError, jsonSuccess } from "@/lib/server/api-response";
import { logServerEvent } from "@/lib/server/log";
import { createServerSupabaseClient, requireAuthenticatedUser } from "@/lib/supabase/server";
import {
  abortHiveDocumentUploadForUser,
  completeHiveDocumentUploadForUser,
  getUploadQuotaForUser,
  listHiveDocumentsForUser,
  prepareHiveDocumentUploadForUser,
  type DocumentServiceError,
} from "@/lib/documents/service";
import {
  parseClientRequestId,
  parseSha256,
  readUploadMaxBytes,
  validateUploadFile,
} from "@/lib/documents/validation";
import { parseHiveIdParam } from "@/lib/hives/validation";

function envelopeCode(code: DocumentServiceError["error_code"]): ErrorCode {
  if (code === "QUOTA_EXCEEDED") {
    return ErrorCode.INVALID_REQUEST;
  }
  return code;
}

function categoryForCode(code: string): (typeof ErrorCategory)[keyof typeof ErrorCategory] {
  if (code === "AUTH_FAILED") return ErrorCategory.AUTH;
  if (code === "ACCESS_DENIED") return ErrorCategory.AUTHORIZATION;
  if (code === "NOT_FOUND") return ErrorCategory.NOT_FOUND;
  if (code === "QUOTA_EXCEEDED") return ErrorCategory.VALIDATION;
  if (code === "INVALID_REQUEST") return ErrorCategory.VALIDATION;
  if (code.startsWith("STORAGE_")) return ErrorCategory.STORAGE;
  if (code.startsWith("DB_") || code === "DEPENDENCY_UNAVAILABLE") {
    return ErrorCategory.DEPENDENCY;
  }
  return ErrorCategory.DEPENDENCY;
}

async function withAuth(correlationId: string, route: string) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) {
    logServerEvent({
      level: "warn",
      service: "web",
      correlation_id: correlationId,
      route,
      error_code: ErrorCode.AUTH_FAILED,
      retryable: false,
      diagnostic_detail: "no_session",
    });
    return null;
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || data.user.id !== auth.userId) {
    return null;
  }
  return supabase;
}

function logFailure(
  correlationId: string,
  route: string,
  started: number,
  error: DocumentServiceError,
) {
  logServerEvent({
    level: "error",
    service: "web",
    correlation_id: correlationId,
    route,
    error_code: error.error_code,
    retryable: error.retryable,
    duration_ms: Date.now() - started,
    diagnostic_detail: error.diagnostic_detail,
  });
}

export async function handleListDocuments(correlationId: string, hiveId: string) {
  const started = Date.now();
  if (!parseHiveIdParam(hiveId)) {
    return jsonError(correlationId, {
      error_code: ErrorCode.INVALID_REQUEST,
      category: ErrorCategory.VALIDATION,
      message_safe: "Invalid Hive id.",
    });
  }
  const supabase = await withAuth(correlationId, "GET /api/v1/hives/[hiveId]/documents");
  if (!supabase) {
    return jsonError(correlationId, {
      error_code: ErrorCode.AUTH_FAILED,
      category: ErrorCategory.AUTH,
      message_safe: "Sign in to see documents.",
    });
  }
  const result = await listHiveDocumentsForUser(supabase, hiveId, correlationId);
  if (!result.ok) {
    logFailure(correlationId, "GET /api/v1/hives/[hiveId]/documents", started, result.error);
    return jsonError(correlationId, {
      error_code: envelopeCode(result.error.error_code),
      category: categoryForCode(result.error.error_code),
      message_safe: result.error.message_safe,
      retryable: result.error.retryable,
    });
  }
  return jsonSuccess(correlationId, result.body);
}

export async function handleGetUploadQuota(correlationId: string) {
  const started = Date.now();
  const supabase = await withAuth(correlationId, "GET /api/v1/documents/quota");
  if (!supabase) {
    return jsonError(correlationId, {
      error_code: ErrorCode.AUTH_FAILED,
      category: ErrorCategory.AUTH,
      message_safe: "Sign in to see upload quota.",
    });
  }
  const result = await getUploadQuotaForUser(supabase, correlationId);
  if (!result.ok) {
    logFailure(correlationId, "GET /api/v1/documents/quota", started, result.error);
    return jsonError(correlationId, {
      error_code: envelopeCode(result.error.error_code),
      category: categoryForCode(result.error.error_code),
      message_safe: result.error.message_safe,
      retryable: result.error.retryable,
    });
  }
  return jsonSuccess(correlationId, result.body);
}

export async function handlePrepareDocumentUpload(
  correlationId: string,
  hiveId: string,
  body: unknown,
) {
  const started = Date.now();
  if (!parseHiveIdParam(hiveId)) {
    return jsonError(correlationId, {
      error_code: ErrorCode.INVALID_REQUEST,
      category: ErrorCategory.VALIDATION,
      message_safe: "Invalid Hive id.",
    });
  }
  if (!body || typeof body !== "object") {
    return jsonError(correlationId, {
      error_code: ErrorCode.INVALID_REQUEST,
      category: ErrorCategory.VALIDATION,
      message_safe: "Request body must be a JSON object.",
    });
  }
  const record = body as Record<string, unknown>;
  const clientRequestId = parseClientRequestId(record.client_request_id);
  const filename = typeof record.filename === "string" ? record.filename.trim() : "";
  const mimeType = typeof record.mime_type === "string" ? record.mime_type.trim() : "";
  const byteSize = typeof record.byte_size === "number" ? record.byte_size : NaN;
  if (!clientRequestId || !filename || !mimeType || !Number.isFinite(byteSize)) {
    return jsonError(correlationId, {
      error_code: ErrorCode.INVALID_REQUEST,
      category: ErrorCategory.VALIDATION,
      message_safe: "Missing or invalid upload fields.",
    });
  }
  const maxBytes = readUploadMaxBytes();
  if (byteSize <= 0 || byteSize > maxBytes) {
    return jsonError(correlationId, {
      error_code: ErrorCode.INVALID_REQUEST,
      category: ErrorCategory.VALIDATION,
      message_safe: "File size is outside the allowed limit.",
    });
  }

  const supabase = await withAuth(correlationId, "POST /api/v1/hives/[hiveId]/documents/prepare");
  if (!supabase) {
    return jsonError(correlationId, {
      error_code: ErrorCode.AUTH_FAILED,
      category: ErrorCategory.AUTH,
      message_safe: "Sign in to upload documents.",
    });
  }
  const result = await prepareHiveDocumentUploadForUser(supabase, hiveId, correlationId, {
    client_request_id: clientRequestId,
    filename,
    mime_type: mimeType,
    byte_size: byteSize,
  });
  if (!result.ok) {
    logFailure(correlationId, "POST /api/v1/hives/[hiveId]/documents/prepare", started, result.error);
    return jsonError(correlationId, {
      error_code: envelopeCode(result.error.error_code),
      category: categoryForCode(result.error.error_code),
      message_safe: result.error.message_safe,
      retryable: result.error.retryable,
    });
  }
  return jsonSuccess(correlationId, result.body);
}

export async function handleCompleteDocumentUpload(
  correlationId: string,
  hiveId: string,
  body: unknown,
) {
  const started = Date.now();
  if (!parseHiveIdParam(hiveId)) {
    return jsonError(correlationId, {
      error_code: ErrorCode.INVALID_REQUEST,
      category: ErrorCategory.VALIDATION,
      message_safe: "Invalid Hive id.",
    });
  }
  if (!body || typeof body !== "object") {
    return jsonError(correlationId, {
      error_code: ErrorCode.INVALID_REQUEST,
      category: ErrorCategory.VALIDATION,
      message_safe: "Request body must be a JSON object.",
    });
  }
  const record = body as Record<string, unknown>;
  const clientRequestId = parseClientRequestId(record.client_request_id);
  const sha256 = parseSha256(record.sha256);
  const byteSize = typeof record.byte_size === "number" ? record.byte_size : NaN;
  if (!clientRequestId || !sha256 || !Number.isFinite(byteSize)) {
    return jsonError(correlationId, {
      error_code: ErrorCode.INVALID_REQUEST,
      category: ErrorCategory.VALIDATION,
      message_safe: "Missing or invalid completion fields.",
    });
  }

  const supabase = await withAuth(correlationId, "POST /api/v1/hives/[hiveId]/documents/complete");
  if (!supabase) {
    return jsonError(correlationId, {
      error_code: ErrorCode.AUTH_FAILED,
      category: ErrorCategory.AUTH,
      message_safe: "Sign in to upload documents.",
    });
  }
  const result = await completeHiveDocumentUploadForUser(supabase, hiveId, correlationId, {
    client_request_id: clientRequestId,
    sha256,
    byte_size: byteSize,
  });
  if (!result.ok) {
    logFailure(correlationId, "POST /api/v1/hives/[hiveId]/documents/complete", started, result.error);
    return jsonError(correlationId, {
      error_code: envelopeCode(result.error.error_code),
      category: categoryForCode(result.error.error_code),
      message_safe: result.error.message_safe,
      retryable: result.error.retryable,
    });
  }
  return jsonSuccess(correlationId, result.body);
}

export async function handleAbortDocumentUpload(
  correlationId: string,
  hiveId: string,
  body: unknown,
) {
  const started = Date.now();
  if (!parseHiveIdParam(hiveId)) {
    return jsonError(correlationId, {
      error_code: ErrorCode.INVALID_REQUEST,
      category: ErrorCategory.VALIDATION,
      message_safe: "Invalid Hive id.",
    });
  }
  if (!body || typeof body !== "object") {
    return jsonError(correlationId, {
      error_code: ErrorCode.INVALID_REQUEST,
      category: ErrorCategory.VALIDATION,
      message_safe: "Request body must be a JSON object.",
    });
  }
  const record = body as Record<string, unknown>;
  const clientRequestId = parseClientRequestId(record.client_request_id);
  if (!clientRequestId) {
    return jsonError(correlationId, {
      error_code: ErrorCode.INVALID_REQUEST,
      category: ErrorCategory.VALIDATION,
      message_safe: "Missing client_request_id.",
    });
  }
  const reason = record.reason === "failed" ? "failed" : "abandoned";

  const supabase = await withAuth(correlationId, "POST /api/v1/hives/[hiveId]/documents/abort");
  if (!supabase) {
    return jsonError(correlationId, {
      error_code: ErrorCode.AUTH_FAILED,
      category: ErrorCategory.AUTH,
      message_safe: "Sign in to upload documents.",
    });
  }
  const result = await abortHiveDocumentUploadForUser(supabase, hiveId, correlationId, {
    client_request_id: clientRequestId,
    reason,
  });
  if (!result.ok) {
    logFailure(correlationId, "POST /api/v1/hives/[hiveId]/documents/abort", started, result.error);
    return jsonError(correlationId, {
      error_code: envelopeCode(result.error.error_code),
      category: categoryForCode(result.error.error_code),
      message_safe: result.error.message_safe,
      retryable: result.error.retryable,
    });
  }
  return jsonSuccess(correlationId, { aborted: true });
}

export function validateClientUploadFile(file: File) {
  return validateUploadFile(file, readUploadMaxBytes());
}
