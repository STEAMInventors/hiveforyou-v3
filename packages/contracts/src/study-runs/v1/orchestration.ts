import type {
  StudyRunPlanningSummarySafeV1,
  StudyRunSafeV1,
  StudyRunTriggerV1,
} from "./types.js";

/** Inngest event: durable enqueue after Supabase submit succeeds. */
export const STUDY_RUN_QUEUED_EVENT = "hive3/study_run.queued" as const;

export type StudyRunQueuedEventDataV1 = {
  study_run_id: string;
  hive_id: string;
  correlation_id: string;
  delivery_idempotency_key: string;
};

/**
 * Owner clarification stored on `hive3.intents.clarification_json`.
 * `domain_hint` is an optional pack domain id from explicit UI Domain Pack selection.
 * When present, Worker routes to selected-Pack extraction (fail closed if unavailable);
 * omit it for pack-free runs on the generic path.
 */
export type StudyIntentClarificationV1 = {
  domain_hint?: string | null;
};

const DOMAIN_HINT_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export function domainHintFromClarification(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const hint = (value as Record<string, unknown>).domain_hint;
  if (typeof hint !== "string") {
    return null;
  }
  const trimmed = hint.trim();
  if (!DOMAIN_HINT_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function clarificationJsonForDomainHint(
  domainId: string | null | undefined,
): StudyIntentClarificationV1 | null {
  const hint = domainHintFromClarification(domainId ? { domain_hint: domainId } : null);
  return hint ? { domain_hint: hint } : null;
}

export type SubmitStudyProcessingRequestV1 = {
  request_text: string;
  trigger: StudyRunTriggerV1;
  /** Client-generated delivery dedupe key (one per intentional submit). */
  idempotency_key: string;
  clarification_json?: StudyIntentClarificationV1 | null;
};

/** Owner read of the latest processing run and the intent that run stored. */
export type HiveProcessingHandoffV1 = {
  study_run: StudyRunSafeV1 | null;
  intent_request_text: string | null;
  domain_hint: string | null;
  planning_summary: StudyRunPlanningSummarySafeV1 | null;
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
