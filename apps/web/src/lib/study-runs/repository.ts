import type {
  StudyRunPlanningSummarySafeV1,
  StudyRunSafeV1,
  SubmitStudyProcessingResponseV1,
} from "@hiveforyou/contracts/study-runs/v1";
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
    clarificationJson: Record<string, unknown> | null;
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
