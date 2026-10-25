import {
  domainHintFromClarification,
  type HiveProcessingHandoffV1,
  type StudyIntentClarificationV1,
  type StudyRunPlanningSummarySafeV1,
  type StudyRunSafeV1,
  type SubmitStudyProcessingResponseV1,
  type GetIntentResponseV1,
} from "@hiveforyou/contracts/study-runs/v1";
import { ErrorCategory, ErrorCode } from "@hiveforyou/contracts/errors/v1";
import {
  parsePackExtractionOwnerViewV1,
  parsePackExtractionProgressV1,
  type PackExtractionOwnerViewV1,
  type PackExtractionProgressV1,
} from "@hiveforyou/contracts/pack-extraction/v1";
import type { SupabaseClient } from "@supabase/supabase-js";

import { mapSupabaseRpcError } from "@/lib/server/supabase-errors";

export async function submitStudyProcessing(
  supabase: SupabaseClient,
  input: {
    hiveId: string;
    requestText: string;
    trigger: string;
    correlationId: string;
    idempotencyKey: string;
    clarificationJson: StudyIntentClarificationV1 | null;
  },
): Promise<
  | { ok: true; data: SubmitStudyProcessingResponseV1 }
  | { ok: false; error: ReturnType<typeof mapSupabaseRpcError> }
> {
  const { data, error } = await supabase.rpc("hive3_p15_submit_study_processing", {
    p_hive_id: input.hiveId,
    p_request_text: input.requestText,
    p_trigger: input.trigger,
    p_correlation_id: input.correlationId,
    p_idempotency_key: input.idempotencyKey,
    p_clarification_json: input.clarificationJson,
  });
  if (error) {
    return { ok: false, error: mapSupabaseRpcError(error.message) };
  }
  const row = data as SubmitStudyProcessingResponseV1;
  return { ok: true, data: row };
}

export async function getStudyRunForOwner(
  supabase: SupabaseClient,
  studyRunId: string,
): Promise<
  | { ok: true; data: StudyRunSafeV1 }
  | { ok: false; error: ReturnType<typeof mapSupabaseRpcError> }
> {
  const { data, error } = await supabase.rpc("hive3_p1p_get_study_run", {
    p_study_run_id: studyRunId,
  });
  if (error) {
    return { ok: false, error: mapSupabaseRpcError(error.message) };
  }
  return { ok: true, data: data as StudyRunSafeV1 };
}

export async function getStudyRunPlanningSummaryForOwner(
  supabase: SupabaseClient,
  studyRunId: string,
): Promise<
  | { ok: true; data: StudyRunPlanningSummarySafeV1 }
  | { ok: false; error: ReturnType<typeof mapSupabaseRpcError> }
> {
  const { data, error } = await supabase.rpc("hive3_p15_owner_get_planning_summary", {
    p_study_run_id: studyRunId,
  });
  if (error) {
    return { ok: false, error: mapSupabaseRpcError(error.message) };
  }
  return { ok: true, data: data as StudyRunPlanningSummarySafeV1 };
}

export async function getStudyRunExtractionForOwner(
  supabase: SupabaseClient,
  studyRunId: string,
): Promise<
  | { ok: true; data: PackExtractionOwnerViewV1 }
  | { ok: false; error: ReturnType<typeof mapSupabaseRpcError> }
> {
  const { data, error } = await supabase.rpc("hive3_p2px_owner_list_extraction_batches", {
    p_study_run_id: studyRunId,
  });
  if (error) {
    return { ok: false, error: mapSupabaseRpcError(error.message) };
  }
  const parsed = parsePackExtractionOwnerViewV1(data);
  if (!parsed.ok) {
    return {
      ok: false,
      error: {
        error_code: ErrorCode.DEPENDENCY_UNAVAILABLE,
        category: ErrorCategory.DEPENDENCY,
        retryable: false,
        message_safe: "Extracted facts could not be loaded.",
        diagnostic_detail: "owner_view_malformed",
      },
    };
  }
  return { ok: true, data: parsed.value };
}

export async function getStudyRunExtractionProgressForOwner(
  supabase: SupabaseClient,
  studyRunId: string,
): Promise<
  | { ok: true; data: PackExtractionProgressV1 }
  | { ok: false; error: ReturnType<typeof mapSupabaseRpcError> }
> {
  const { data, error } = await supabase.rpc("hive3_p2px_owner_get_extraction_progress", {
    p_study_run_id: studyRunId,
  });
  if (error) {
    return { ok: false, error: mapSupabaseRpcError(error.message) };
  }
  const parsed = parsePackExtractionProgressV1(data);
  if (!parsed.ok) {
    return {
      ok: false,
      error: {
        error_code: ErrorCode.DEPENDENCY_UNAVAILABLE,
        category: ErrorCategory.DEPENDENCY,
        retryable: false,
        message_safe: "Reading progress could not be loaded.",
        diagnostic_detail: "progress_malformed",
      },
    };
  }
  return { ok: true, data: parsed.value };
}

export async function getHiveProcessingHandoff(
  supabase: SupabaseClient,
  hiveId: string,
): Promise<
  | { ok: true; data: HiveProcessingHandoffV1 }
  | { ok: false; error: ReturnType<typeof mapSupabaseRpcError> }
> {
  const listed = await supabase.rpc("hive3_p1p_list_study_runs", {
    p_hive_id: hiveId,
    p_limit: 1,
  });
  if (listed.error) {
    return { ok: false, error: mapSupabaseRpcError(listed.error.message) };
  }
  let listedData: unknown = listed.data;
  if (typeof listedData === "string") {
    try {
      listedData = JSON.parse(listedData) as unknown;
    } catch {
      listedData = [];
    }
  }
  const runs = Array.isArray(listedData) ? (listedData as StudyRunSafeV1[]) : [];
  const latest = runs[0] ?? null;
  if (!latest) {
    return {
      ok: true,
      data: {
        study_run: null,
        intent_request_text: null,
        domain_hint: null,
        planning_summary: null,
      },
    };
  }

  let intentRequestText: string | null = null;
  let domainHint: string | null = null;
  if (latest.intent_id) {
    const intent = await supabase.rpc("hive3_p1p_get_intent", {
      p_intent_id: latest.intent_id,
    });
    if (!intent.error && intent.data && typeof intent.data === "object") {
      const row = intent.data as GetIntentResponseV1;
      intentRequestText = typeof row.request_text === "string" ? row.request_text : null;
      domainHint = domainHintFromClarification(row.clarification_json);
    }
  }

  const planning = await getStudyRunPlanningSummaryForOwner(supabase, latest.id);
  return {
    ok: true,
    data: {
      study_run: latest,
      intent_request_text: intentRequestText,
      domain_hint: domainHint,
      planning_summary: planning.ok ? planning.data : null,
    },
  };
}
