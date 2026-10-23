import { StudyRunStage, StudyRunStatus } from "@hiveforyou/contracts/errors/v1";
import { describe, expect, it, vi } from "vitest";

import { processStudyRun } from "./process-study-run.js";

describe("processStudyRun", () => {
  it("returns idempotent replay for terminal runs", async () => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === "hive3_p15_worker_get_processing_context") {
        return {
          data: {
            study_run: {
              id: "run-1",
              hive_id: "hive-1",
              status: StudyRunStatus.SUCCEEDED,
              stage: StudyRunStage.FINALIZE,
            },
            owner_user_id: "owner-1",
            intent_request_text: "test",
          },
          error: null,
        };
      }
      return { data: null, error: { message: "unexpected" } };
    });

    const result = await processStudyRun({ rpc }, {
      contract_version: "worker-process-study-run@1",
      study_run_id: "run-1",
      hive_id: "hive-1",
      correlation_id: "corr-1",
    });

    expect(result.idempotent_replay).toBe(true);
    expect(result.status).toBe(StudyRunStatus.SUCCEEDED);
  });

  it("rejects hive mismatch", async () => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === "hive3_p15_worker_get_processing_context") {
        return {
          data: {
            study_run: {
              id: "run-1",
              hive_id: "hive-other",
              status: StudyRunStatus.QUEUED,
              stage: StudyRunStage.ENQUEUE,
            },
            owner_user_id: "owner-1",
            intent_request_text: "test",
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    await expect(
      processStudyRun({ rpc }, {
        contract_version: "worker-process-study-run@1",
        study_run_id: "run-1",
        hive_id: "hive-1",
        correlation_id: "corr-1",
      }),
    ).rejects.toMatchObject({ errorCode: "INVALID_REQUEST" });
  });
});
