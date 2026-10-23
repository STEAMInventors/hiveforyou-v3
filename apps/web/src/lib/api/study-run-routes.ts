import { ErrorCategory, ErrorCode } from "@hiveforyou/contracts/errors/v1";
import type { HiveProcessingHandoffV1, SubmitStudyProcessingResponseV1 } from "@hiveforyou/contracts/study-runs/v1";
import { STUDY_RUN_QUEUED_EVENT } from "@hiveforyou/contracts/study-runs/v1";

import { jsonError, jsonSuccess } from "@/lib/server/api-response";
import { logServerEvent } from "@/lib/server/log";
import {
  getHiveProcessingHandoff,
  getStudyRunForOwner,
  getStudyRunPlanningSummaryForOwner,
  submitStudyProcessing,
} from "@/lib/study-runs/repository";
import { shouldEnqueueStudyRun } from "@/lib/study-runs/handoff";
import { parseStudyRunIdParam, parseSubmitStudyProcessingBody } from "@/lib/study-runs/validation";
import { createServerSupabaseClient, requireAuthenticatedUser } from "@/lib/supabase/server";
import { parseHiveIdParam } from "@/lib/hives/validation";
import { sendStudyRunQueuedEvent } from "@/lib/inngest/send-study-run-queued";

function categoryForCode(code: string): (typeof ErrorCategory)[keyof typeof ErrorCategory] {
  if (code === ErrorCode.AUTH_FAILED) return ErrorCategory.AUTH;
  if (code === ErrorCode.ACCESS_DENIED) return ErrorCategory.AUTHORIZATION;
  if (code === ErrorCode.NOT_FOUND) return ErrorCategory.NOT_FOUND;
  if (code === ErrorCode.INVALID_REQUEST) return ErrorCategory.VALIDATION;
  return ErrorCategory.DEPENDENCY;
}

export async function handleSubmitStudyProcessing(
  correlationId: string,
  hiveIdParam: string,
  body: unknown,
): Promise<Response> {
  const started = Date.now();
  if (!parseHiveIdParam(hiveIdParam)) {
    return jsonError(correlationId, {
      error_code: ErrorCode.INVALID_REQUEST,
      category: ErrorCategory.VALIDATION,
      message_safe: "Invalid Hive id.",
    });
  }
  const hiveId = hiveIdParam;

  const auth = await requireAuthenticatedUser();
  if (!auth.ok) {
    return jsonError(correlationId, {
      error_code: ErrorCode.AUTH_FAILED,
      category: ErrorCategory.AUTH,
      message_safe: "Sign in to start processing.",
    });
  }

  const parsed = parseSubmitStudyProcessingBody(body);
  if (!parsed.ok) {
    return jsonError(correlationId, {
      error_code: ErrorCode.INVALID_REQUEST,
      category: ErrorCategory.VALIDATION,
      message_safe: parsed.message,
    });
  }

  const supabase = await createServerSupabaseClient();
  const submitResult = await submitStudyProcessing(supabase, {
    hiveId,
    requestText: parsed.value.request_text,
    trigger: parsed.value.trigger,
    correlationId,
    idempotencyKey: parsed.value.idempotency_key,
    clarificationJson: parsed.value.clarification_json,
  });

  if (!submitResult.ok) {
    logServerEvent({
      level: "warn",
      service: "web",
      correlation_id: correlationId,
      route: "POST /api/v1/hives/[hiveId]/study-runs/submit",
      error_code: submitResult.error.error_code,
      retryable: submitResult.error.retryable,
      duration_ms: Date.now() - started,
      diagnostic_detail: submitResult.error.diagnostic_detail,
    });
    return jsonError(correlationId, {
      error_code: submitResult.error.error_code,
      category: categoryForCode(submitResult.error.error_code),
      message_safe: submitResult.error.message_safe,
      retryable: submitResult.error.retryable,
    });
  }

  const payload: SubmitStudyProcessingResponseV1 = submitResult.data;
  const run = payload.study_run;

  if (shouldEnqueueStudyRun(payload.idempotent_replay, run.status)) {
    try {
      await sendStudyRunQueuedEvent({
        name: STUDY_RUN_QUEUED_EVENT,
        data: {
          study_run_id: run.id,
          hive_id: run.hive_id,
          correlation_id: run.correlation_id,
          delivery_idempotency_key: parsed.value.idempotency_key,
        },
      });
    } catch (error) {
      logServerEvent({
        level: "error",
        service: "web",
        correlation_id: correlationId,
        study_run_id: run.id,
        route: "POST /api/v1/hives/[hiveId]/study-runs/submit",
        error_code: ErrorCode.DEPENDENCY_UNAVAILABLE,
        retryable: true,
        duration_ms: Date.now() - started,
        diagnostic_detail: error instanceof Error ? error.name : "inngest_send_failed",
      });
      return jsonError(correlationId, {
        error_code: ErrorCode.DEPENDENCY_UNAVAILABLE,
        category: ErrorCategory.DEPENDENCY,
        message_safe: "Your run was saved but could not be queued. Try again shortly.",
        retryable: true,
      });
    }
  }

  logServerEvent({
    level: "info",
    service: "web",
    correlation_id: correlationId,
    study_run_id: run.id,
    route: "POST /api/v1/hives/[hiveId]/study-runs/submit",
    duration_ms: Date.now() - started,
    diagnostic_detail: payload.idempotent_replay ? "idempotent_replay" : "queued",
  });

  return jsonSuccess(correlationId, payload, 202);
}

export async function handleGetStudyRun(
  correlationId: string,
  hiveIdParam: string,
  studyRunIdParam: string,
): Promise<Response> {
  const studyRunId = parseStudyRunIdParam(studyRunIdParam);
  if (!parseHiveIdParam(hiveIdParam) || !studyRunId) {
    return jsonError(correlationId, {
      error_code: ErrorCode.INVALID_REQUEST,
      category: ErrorCategory.VALIDATION,
      message_safe: "Invalid request.",
    });
  }
  const hiveId = hiveIdParam;

  const auth = await requireAuthenticatedUser();
  if (!auth.ok) {
    return jsonError(correlationId, {
      error_code: ErrorCode.AUTH_FAILED,
      category: ErrorCategory.AUTH,
      message_safe: "Sign in to view processing status.",
    });
  }

  const supabase = await createServerSupabaseClient();
  const result = await getStudyRunForOwner(supabase, studyRunId);
  if (!result.ok) {
    return jsonError(correlationId, {
      error_code: result.error.error_code,
      category: categoryForCode(result.error.error_code),
      message_safe: result.error.message_safe,
      retryable: result.error.retryable,
    });
  }

  if (result.data.hive_id !== hiveId) {
    return jsonError(correlationId, {
      error_code: ErrorCode.ACCESS_DENIED,
      category: ErrorCategory.AUTHORIZATION,
      message_safe: "You do not have access to this run.",
    });
  }

  const planning = await getStudyRunPlanningSummaryForOwner(supabase, studyRunId);
  return jsonSuccess(correlationId, {
    study_run: result.data,
    planning_summary: planning.ok ? planning.data : null,
  });
}

export async function handleGetHiveProcessingHandoff(
  correlationId: string,
  hiveIdParam: string,
): Promise<Response> {
  if (!parseHiveIdParam(hiveIdParam)) {
    return jsonError(correlationId, {
      error_code: ErrorCode.INVALID_REQUEST,
      category: ErrorCategory.VALIDATION,
      message_safe: "Invalid Hive id.",
    });
  }

  const auth = await requireAuthenticatedUser();
  if (!auth.ok) {
    return jsonError(correlationId, {
      error_code: ErrorCode.AUTH_FAILED,
      category: ErrorCategory.AUTH,
      message_safe: "Sign in to view processing status.",
    });
  }

  const supabase = await createServerSupabaseClient();
  const result = await getHiveProcessingHandoff(supabase, hiveIdParam);
  if (!result.ok) {
    return jsonError(correlationId, {
      error_code: result.error.error_code,
      category: categoryForCode(result.error.error_code),
      message_safe: result.error.message_safe,
      retryable: result.error.retryable,
    });
  }

  const payload: HiveProcessingHandoffV1 = result.data;
  return jsonSuccess(correlationId, payload);
}
