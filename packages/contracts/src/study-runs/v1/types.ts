import type { StudyRunStage, StudyRunStatus } from "../../errors/v1/study-run-stage.js";

export const RUN_ARTIFACT_CONTRACT_VERSION = "run-artifact@1" as const;

/** Browser-safe run projection from hive3_p1p_* owner RPCs. */
export type StudyRunSafeV1 = {
  id: string;
  hive_id: string;
  intent_id: string | null;
  status: StudyRunStatus;
  stage: StudyRunStage;
  trigger: StudyRunTriggerV1;
  correlation_id: string;
  started_at: string | null;
  finished_at: string | null;
  error_code: string | null;
  error_message_safe: string | null;
  created_at: string;
  updated_at: string;
};

export type StudyRunTriggerV1 = "generate" | "reprocess" | "study";

/** Browser-safe planning projection (no verbatim intent or private catalog). */
export type StudyRunPlanningSummarySafeV1 = {
  study_run_id: string;
  stage: StudyRunStage;
  merged_question_count: number;
  merged_question_labels: string[];
  budget_outcome: "WITHIN_BUDGET" | "PARTIAL_DEFERRED" | null;
  pack_id: string | null;
  pack_version: string | null;
  question_set_hash_prefix: string | null;
};

export type RunArtifactV1 = {
  id: string;
  study_run_id: string;
  hive_id: string;
  artifact_kind: string;
  contract_version: string;
  revision: number;
  content_sha256: string;
  payload_jsonb: unknown;
  storage_path: string | null;
  created_at: string;
};

export type InsertIntentResponseV1 = {
  intent_id: string;
  hive_id: string;
  created_at: string;
};

export type GetIntentResponseV1 = {
  intent_id: string;
  hive_id: string;
  request_text: string;
  status: string;
  clarification_json: unknown | null;
  created_at: string;
};

/** Gate 1 smoke artifact kind; Gate 2 adds planning kinds on the same store. */
export const GATE1_SMOKE_ARTIFACT_KIND = "gate1-smoke@1" as const;
