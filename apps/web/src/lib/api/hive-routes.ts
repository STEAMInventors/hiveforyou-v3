import { ErrorCategory, ErrorCode } from "@hiveforyou/contracts/errors/v1";

import { jsonError, jsonSuccess } from "@/lib/server/api-response";
import { logServerEvent } from "@/lib/server/log";
import { createServerSupabaseClient, requireAuthenticatedUser } from "@/lib/supabase/server";
import {
  createHiveForUser,
  getHiveForUser,
  listHivesForUser,
} from "@/lib/hives/service";
import { parseCreateHiveBody, parseHiveIdParam } from "@/lib/hives/validation";

function categoryForCode(code: string): (typeof ErrorCategory)[keyof typeof ErrorCategory] {
  if (code === "AUTH_FAILED") return ErrorCategory.AUTH;
  if (code === "ACCESS_DENIED") return ErrorCategory.AUTHORIZATION;
  if (code === "NOT_FOUND") return ErrorCategory.NOT_FOUND;
  if (code === "INVALID_REQUEST") return ErrorCategory.VALIDATION;
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
    logServerEvent({
      level: "warn",
      service: "web",
      correlation_id: correlationId,
      route,
      error_code: ErrorCode.AUTH_FAILED,
      retryable: false,
      diagnostic_detail: "session_mismatch",
    });
    return null;
  }
  return supabase;
}

export async function handleListHives(correlationId: string) {
  const started = Date.now();
  const supabase = await withAuth(correlationId, "GET /api/v1/hives");
  if (!supabase) {
    return jsonError(correlationId, {
      error_code: ErrorCode.AUTH_FAILED,
      category: ErrorCategory.AUTH,
      message_safe: "Sign in to see your Hives.",
    });
  }
  const result = await listHivesForUser(supabase, correlationId);
  if (!result.ok) {
    logServerEvent({
      level: "error",
      service: "web",
      correlation_id: correlationId,
      route: "GET /api/v1/hives",
      error_code: result.error.error_code,
      retryable: result.error.retryable,
      duration_ms: Date.now() - started,
      diagnostic_detail: result.error.diagnostic_detail,
    });
    return jsonError(correlationId, {
      error_code: result.error.error_code,
      category: categoryForCode(result.error.error_code),
      message_safe: result.error.message_safe,
      retryable: result.error.retryable,
    });
  }
  return jsonSuccess(correlationId, result.body);
}

export async function handleCreateHive(correlationId: string, body: unknown) {
  const started = Date.now();
  const parsed = parseCreateHiveBody(body);
  if (!parsed.ok) {
    return jsonError(correlationId, {
      error_code: ErrorCode.INVALID_REQUEST,
      category: ErrorCategory.VALIDATION,
      message_safe: parsed.message,
    });
  }
  const supabase = await withAuth(correlationId, "POST /api/v1/hives");
  if (!supabase) {
    return jsonError(correlationId, {
      error_code: ErrorCode.AUTH_FAILED,
      category: ErrorCategory.AUTH,
      message_safe: "Sign in to create a Hive.",
    });
  }
  const result = await createHiveForUser(supabase, parsed.value, correlationId);
  if (!result.ok) {
    logServerEvent({
      level: "error",
      service: "web",
      correlation_id: correlationId,
      route: "POST /api/v1/hives",
      error_code: result.error.error_code,
      retryable: result.error.retryable,
      duration_ms: Date.now() - started,
      diagnostic_detail: result.error.diagnostic_detail,
    });
    return jsonError(correlationId, {
      error_code: result.error.error_code,
      category: categoryForCode(result.error.error_code),
      message_safe: result.error.message_safe,
      retryable: result.error.retryable,
    });
  }
  return jsonSuccess(correlationId, result.body, result.body.created ? 201 : 200);
}

export async function handleGetHive(correlationId: string, hiveId: string) {
  const started = Date.now();
  if (!parseHiveIdParam(hiveId)) {
    return jsonError(correlationId, {
      error_code: ErrorCode.INVALID_REQUEST,
      category: ErrorCategory.VALIDATION,
      message_safe: "Invalid Hive id.",
    });
  }
  const supabase = await withAuth(correlationId, "GET /api/v1/hives/[hiveId]");
  if (!supabase) {
    return jsonError(correlationId, {
      error_code: ErrorCode.AUTH_FAILED,
      category: ErrorCategory.AUTH,
      message_safe: "Sign in to open this Hive.",
    });
  }
  const result = await getHiveForUser(supabase, hiveId, correlationId);
  if (!result.ok) {
    if (result.error.error_code !== "NOT_FOUND") {
      logServerEvent({
        level: "error",
        service: "web",
        correlation_id: correlationId,
        route: "GET /api/v1/hives/[hiveId]",
        error_code: result.error.error_code,
        retryable: result.error.retryable,
        duration_ms: Date.now() - started,
        diagnostic_detail: result.error.diagnostic_detail,
      });
    }
    return jsonError(correlationId, {
      error_code: result.error.error_code,
      category: categoryForCode(result.error.error_code),
      message_safe: result.error.message_safe,
      retryable: result.error.retryable,
    });
  }
  return jsonSuccess(correlationId, result.body);
}
