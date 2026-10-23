import { ErrorCode, StudyRunStage, StudyRunStatus } from "@hiveforyou/contracts/errors/v1";
import {
  STUDY_RUN_QUEUED_EVENT,
  type StudyRunQueuedEventDataV1,
  type WorkerProcessStudyRunRequestV1,
} from "@hiveforyou/contracts/study-runs/v1";
import { NonRetriableError } from "inngest";

import { ProcessStudyRunError, processStudyRun } from "../../orchestration/process-study-run.js";
import {
  asPersistenceClient,
  createWorkerServiceClient,
} from "../../persistence/supabase-service-client.js";
import {
  StudyRunPersistenceError,
  workerTransitionStudyRun,
} from "../../persistence/study-run-persistence.js";
import { workerInngest } from "../client.js";
import { logWorkerEvent } from "../log.js";

function logProcessStudyRunFailure(
  data: StudyRunQueuedEventDataV1,
  error: ProcessStudyRunError,
): void {
  const diagnostics = error.diagnostics;
  logWorkerEvent({
    level: "error",
    message: "process_study_run_failed",
    correlation_id: data.correlation_id,
    study_run_id: data.study_run_id,
    route: "inngest/hive3-process-study-run",
    error_code: error.errorCode,
    retryable: error.retryable,
    diagnostic_detail:
      typeof diagnostics?.reason === "string" ? diagnostics.reason : undefined,
    model_alias: typeof diagnostics?.alias === "string" ? diagnostics.alias : undefined,
    gateway_status: typeof diagnostics?.status === "number" ? diagnostics.status : undefined,
    duration_ms: typeof diagnostics?.duration_ms === "number" ? diagnostics.duration_ms : undefined,
  });
}

function toWorkerRequest(data: StudyRunQueuedEventDataV1): WorkerProcessStudyRunRequestV1 {
  return {
    contract_version: "worker-process-study-run@1",
    study_run_id: data.study_run_id,
    hive_id: data.hive_id,
    correlation_id: data.correlation_id,
  };
}

export async function executeProcessStudyRunForEvent(
  data: StudyRunQueuedEventDataV1,
): Promise<{ ok: true; study_run_id: string; idempotent_replay?: boolean }> {
  const supabase = createWorkerServiceClient();
  try {
    const result = await processStudyRun(asPersistenceClient(supabase), toWorkerRequest(data));
    return {
      ok: true,
      study_run_id: result.study_run_id,
      idempotent_replay: result.idempotent_replay,
    };
  } catch (error) {
    if (error instanceof ProcessStudyRunError) {
      if (error.diagnostics) {
        logProcessStudyRunFailure(data, error);
      }
      if (!error.retryable) {
        throw new NonRetriableError(error.messageSafe);
      }
    }
    throw error;
  }
}

export async function markRunFailedAfterInngestRetries(
  data: StudyRunQueuedEventDataV1,
): Promise<void> {
  const supabase = createWorkerServiceClient();
  try {
    await workerTransitionStudyRun(asPersistenceClient(supabase), {
      studyRunId: data.study_run_id,
      status: StudyRunStatus.FAILED,
      stage: StudyRunStage.FINALIZE,
      errorCode: ErrorCode.DEPENDENCY_UNAVAILABLE,
      errorMessageSafe: "Processing could not complete after several attempts.",
    });
  } catch (error) {
    if (
      error instanceof StudyRunPersistenceError &&
      error.boundary?.message_safe.includes("already finished")
    ) {
      return;
    }
    throw error;
  }
}

export const processStudyRunInngestFunction = workerInngest.createFunction(
  {
    id: "hive3-process-study-run",
    retries: 3,
    onFailure: async ({ event }) => {
      const data = event.data.event.data as StudyRunQueuedEventDataV1;
      try {
        await markRunFailedAfterInngestRetries(data);
      } catch (error) {
        logWorkerEvent({
          level: "error",
          message: "inngest_process_study_run_on_failure_error",
          correlation_id: data.correlation_id,
          study_run_id: data.study_run_id,
          route: "inngest/hive3-process-study-run/onFailure",
          error_code: ErrorCode.DB_TRANSIENT,
          retryable: true,
          diagnostic_detail: error instanceof Error ? error.message : "mark_failed_error",
        });
      }
    },
  },
  { event: STUDY_RUN_QUEUED_EVENT },
  async ({ event, step }) => {
    const data = event.data as StudyRunQueuedEventDataV1;
    return step.run("process-study-run", async () => executeProcessStudyRunForEvent(data));
  },
);
