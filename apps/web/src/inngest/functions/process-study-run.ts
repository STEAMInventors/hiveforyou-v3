import { ErrorCode } from "@hiveforyou/contracts/errors/v1";
import { StudyRunStage, StudyRunStatus } from "@hiveforyou/contracts/errors/v1";
import {
  STUDY_RUN_QUEUED_EVENT,
  WORKER_PROCESS_STUDY_RUN_PATH,
  type StudyRunQueuedEventDataV1,
  type WorkerProcessStudyRunRequestV1,
} from "@hiveforyou/contracts/study-runs/v1";

import { inngest } from "@/lib/inngest/client";
import { logServerEvent } from "@/lib/server/log";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

const READER_HTTP_HEADERS = {
  CORRELATION: "x-correlation-id",
  STUDY_RUN: "x-study-run-id",
} as const;

async function invokeOracleWorker(data: StudyRunQueuedEventDataV1): Promise<void> {
  const baseUrl = process.env.WORKER_ORACLE_BASE_URL?.trim();
  const token = process.env.WORKER_SERVICE_TOKEN?.trim();
  if (!baseUrl || !token) {
    throw new Error("WORKER_ORACLE_BASE_URL and WORKER_SERVICE_TOKEN are required.");
  }

  const body: WorkerProcessStudyRunRequestV1 = {
    contract_version: "worker-process-study-run@1",
    study_run_id: data.study_run_id,
    hive_id: data.hive_id,
    correlation_id: data.correlation_id,
  };

  const timeoutMs = Number.parseInt(process.env.WORKER_HTTP_TIMEOUT_MS?.trim() ?? "300000", 10);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}${WORKER_PROCESS_STUDY_RUN_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        [READER_HTTP_HEADERS.CORRELATION]: data.correlation_id,
        [READER_HTTP_HEADERS.STUDY_RUN]: data.study_run_id,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (response.ok) {
      return;
    }
    const payload = (await response.json()) as { retryable?: boolean; message_safe?: string };
    const retryable = response.status >= 500 || payload.retryable === true;
    const err = new Error(payload.message_safe ?? "Worker processing failed.");
    (err as Error & { retryable?: boolean }).retryable = retryable;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function markRunFailedAfterRetries(data: StudyRunQueuedEventDataV1): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  await supabase.rpc("hive3_p1p_worker_transition_study_run", {
    p_study_run_id: data.study_run_id,
    p_status: StudyRunStatus.FAILED,
    p_stage: StudyRunStage.FINALIZE,
    p_error_code: ErrorCode.DEPENDENCY_UNAVAILABLE,
    p_error_message_safe: "Processing could not complete after several attempts.",
    p_model_alias: null,
    p_pack_version: null,
  });
}

export const processStudyRunFunction = inngest.createFunction(
  {
    id: "hive3-process-study-run",
    retries: 3,
    onFailure: async ({ event }) => {
      const data = event.data.event.data as StudyRunQueuedEventDataV1;
      try {
        await markRunFailedAfterRetries(data);
      } catch (error) {
        logServerEvent({
          level: "error",
          service: "web",
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
    await step.run("invoke-oracle-worker", async () => {
      await invokeOracleWorker(data);
    });
    return { ok: true, study_run_id: data.study_run_id };
  },
);
