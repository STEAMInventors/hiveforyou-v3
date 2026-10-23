import { ErrorCode, StudyRunStage, StudyRunStatus } from "@hiveforyou/contracts/errors/v1";
import { NonRetriableError } from "inngest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processStudyRun: vi.fn(),
  workerTransitionStudyRun: vi.fn(),
  createWorkerServiceClient: vi.fn(() => ({})),
}));

vi.mock("../../orchestration/process-study-run.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../orchestration/process-study-run.js")>();
  return { ...actual, processStudyRun: mocks.processStudyRun };
});

vi.mock("../../persistence/supabase-service-client.js", () => ({
  createWorkerServiceClient: mocks.createWorkerServiceClient,
  asPersistenceClient: (client: unknown) => client,
}));

vi.mock("../../persistence/study-run-persistence.js", () => ({
  workerTransitionStudyRun: mocks.workerTransitionStudyRun,
}));

const { processStudyRun, workerTransitionStudyRun } = mocks;

import { ProcessStudyRunError } from "../../orchestration/process-study-run.js";

const { executeProcessStudyRunForEvent, markRunFailedAfterInngestRetries } = await import(
  "./process-study-run.js"
);

const eventData = {
  study_run_id: "run-1",
  hive_id: "hive-1",
  correlation_id: "corr-1",
  delivery_idempotency_key: "idem-1",
};

describe("executeProcessStudyRunForEvent", () => {
  beforeEach(() => {
    processStudyRun.mockReset();
  });

  it("returns success when orchestration completes", async () => {
    processStudyRun.mockResolvedValue({
      contract_version: "worker-process-study-run@1",
      study_run_id: "run-1",
      status: StudyRunStatus.SUCCEEDED,
      stage: StudyRunStage.FINALIZE,
    });

    await expect(executeProcessStudyRunForEvent(eventData)).resolves.toEqual({
      ok: true,
      study_run_id: "run-1",
      idempotent_replay: undefined,
    });
  });

  it("maps non-retryable ProcessStudyRunError to NonRetriableError", async () => {
    processStudyRun.mockRejectedValue(
      new ProcessStudyRunError("bad", false, ErrorCode.INVALID_REQUEST, "Invalid run."),
    );

    await expect(executeProcessStudyRunForEvent(eventData)).rejects.toBeInstanceOf(NonRetriableError);
  });

  it("rethrows retryable ProcessStudyRunError for Inngest retries", async () => {
    const err = new ProcessStudyRunError("busy", true, ErrorCode.DEPENDENCY_UNAVAILABLE, "Try again.");
    processStudyRun.mockRejectedValue(err);

    await expect(executeProcessStudyRunForEvent(eventData)).rejects.toBe(err);
  });
});

describe("markRunFailedAfterInngestRetries", () => {
  beforeEach(() => {
    workerTransitionStudyRun.mockReset();
    workerTransitionStudyRun.mockResolvedValue({});
  });

  it("transitions the run to FAILED at FINALIZE", async () => {
    await markRunFailedAfterInngestRetries(eventData);

    expect(workerTransitionStudyRun).toHaveBeenCalledWith(expect.anything(), {
      studyRunId: "run-1",
      status: StudyRunStatus.FAILED,
      stage: StudyRunStage.FINALIZE,
      errorCode: ErrorCode.DEPENDENCY_UNAVAILABLE,
      errorMessageSafe: "Processing could not complete after several attempts.",
    });
  });
});
