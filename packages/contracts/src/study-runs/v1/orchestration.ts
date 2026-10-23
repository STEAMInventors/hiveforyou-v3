import type { StudyRunSafeV1, StudyRunTriggerV1 } from "./types.js";

/** Inngest event: durable enqueue after Supabase submit succeeds. */
export const STUDY_RUN_QUEUED_EVENT = "hive3/study_run.queued" as const;

export type StudyRunQueuedEventDataV1 = {
  study_run_id: string;
  hive_id: string;
  correlation_id: string;
  delivery_idempotency_key: string;
};

export type SubmitStudyProcessingRequestV1 = {
  request_text: string;
  trigger: StudyRunTriggerV1;
  /** Client-generated delivery dedupe key (one per intentional submit). */
  idempotency_key: string;
  clarification_json?: Record<string, unknown> | null;
};

export type SubmitStudyProcessingResponseV1 = {
  study_run: StudyRunSafeV1;
  idempotent_replay: boolean;
};

export const WORKER_PROCESS_STUDY_RUN_PATH = "/internal/v1/process-study-run" as const;

export type WorkerProcessStudyRunRequestV1 = {
  contract_version: "worker-process-study-run@1";
  study_run_id: string;
  hive_id: string;
  correlation_id: string;
};

export type WorkerProcessStudyRunResponseV1 = {
  contract_version: "worker-process-study-run@1";
  study_run_id: string;
  status: StudyRunSafeV1["status"];
  stage: StudyRunSafeV1["stage"];
  idempotent_replay: boolean;
};

export const P15_PROCESSING_SOURCE_SET_KIND = "processing-source-set@1" as const;
export const P15_PROCESSING_RUN_SUMMARY_KIND = "processing-run-summary@1" as const;
export const P15_DOCUMENT_PLAN_KIND = "document-plan-summary@1" as const;
