import { ErrorCode, StudyRunStage, StudyRunStatus } from "@hiveforyou/contracts/errors/v1";
import { NonRetriableError } from "inngest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processStudyRun: vi.fn(),
  workerTransitionStudyRun: vi.fn(),
  createWorkerServiceClient: vi.fn(() => ({})),
  logWorkerEvent: vi.fn(),
}));

vi.mock("../../orchestration/process-study-run.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../orchestration/process-study-run.js")>();
  return { ...actual, processStudyRun: mocks.processStudyRun };
});

vi.mock("../../persistence/supabase-service-client.js", () => ({
  createWorkerServiceClient: mocks.createWorkerServiceClient,
  asPersistenceClient: (client: unknown) => client,
}));

vi.mock("../../persistence/study-run-persistence.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../persistence/study-run-persistence.js")>();
  return { ...actual, workerTransitionStudyRun: mocks.workerTransitionStudyRun };
});

vi.mock("../log.js", () => ({
  logWorkerEvent: mocks.logWorkerEvent,
}));

const { processStudyRun, workerTransitionStudyRun, logWorkerEvent } = mocks;

import { ProcessStudyRunError } from "../../orchestration/process-study-run.js";
import { StudyRunPersistenceError } from "../../persistence/study-run-persistence.js";

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
    logWorkerEvent.mockReset();
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
    expect(logWorkerEvent).not.toHaveBeenCalled();
  });

  it("logs safe planning diagnostics before NonRetriableError", async () => {
    processStudyRun.mockRejectedValue(
      new ProcessStudyRunError(
        "Model returned invalid JSON.",
        false,
        ErrorCode.MODEL_OUTPUT_INVALID,
        "Model returned invalid JSON.",
        { reason: "message_content_invalid_json", alias: "worker-p2-reasoning" },
      ),
    );

    await expect(executeProcessStudyRunForEvent(eventData)).rejects.toBeInstanceOf(NonRetriableError);
    expect(logWorkerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "error",
        message: "process_study_run_failed",
        correlation_id: "corr-1",
        study_run_id: "run-1",
        error_code: ErrorCode.MODEL_OUTPUT_INVALID,
        retryable: false,
        diagnostic_detail: "message_content_invalid_json",
        model_alias: "worker-p2-reasoning",
      }),
    );
  });

  it("rethrows retryable ProcessStudyRunError for Inngest retries", async () => {
    const err = new ProcessStudyRunError("busy", true, ErrorCode.DEPENDENCY_UNAVAILABLE, "Try again.");
    processStudyRun.mockRejectedValue(err);

    await expect(executeProcessStudyRunForEvent(eventData)).rejects.toBe(err);
    expect(logWorkerEvent).not.toHaveBeenCalled();
  });

  it("logs safe planning diagnostics for retryable ProcessStudyRunError", async () => {
    const err = new ProcessStudyRunError(
      "Reasoning gateway returned an error.",
      true,
      ErrorCode.MODEL_UNAVAILABLE,
      "Reasoning gateway returned an error.",
      { reason: "gateway_status", status: 503, alias: "worker-p2-reasoning" },
    );
    processStudyRun.mockRejectedValue(err);

    await expect(executeProcessStudyRunForEvent(eventData)).rejects.toBe(err);
    expect(logWorkerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        correlation_id: "corr-1",
        study_run_id: "run-1",
        error_code: ErrorCode.MODEL_UNAVAILABLE,
        retryable: true,
        diagnostic_detail: "gateway_status",
        gateway_status: 503,
        model_alias: "worker-p2-reasoning",
      }),
    );
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

  it("treats an already-terminal run as idempotent", async () => {
    workerTransitionStudyRun.mockRejectedValue(
      new StudyRunPersistenceError("hive3_p1p_worker_transition_study_run: study_run_terminal"),
    );

    await expect(markRunFailedAfterInngestRetries(eventData)).resolves.toBeUndefined();
  });
});
