import { ErrorCode, StudyRunStage, StudyRunStatus } from "@hiveforyou/contracts/errors/v1";
import { beforeEach, describe, expect, it, vi } from "vitest";

const planMocks = vi.hoisted(() => ({
  buildStudyQuestionSet: vi.fn(),
}));

vi.mock("../plan/plan-questions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../plan/plan-questions.js")>();
  return { ...actual, buildStudyQuestionSet: planMocks.buildStudyQuestionSet };
});

vi.mock("../reasoning/litellm-client.js", () => ({
  createLiteLlmReasoningClient: vi.fn(() => ({})),
}));

vi.mock("../reader/reader-client.js", () => ({
  createReaderClient: vi.fn(() => ({})),
}));

vi.mock("../packs/load-packs.js", () => ({
  loadDomainPacksOrThrow: vi.fn(() => []),
}));

vi.mock("../packs/load-pack-v3-candidate.js", () => ({
  loadIepV3CandidateIfPinned: vi.fn(() => null),
}));

import { PlanningError } from "../plan/errors.js";
import { ProcessStudyRunError, processStudyRun } from "./process-study-run.js";

const { buildStudyQuestionSet } = planMocks;

describe("processStudyRun", () => {
  beforeEach(() => {
    buildStudyQuestionSet.mockReset();
    delete process.env.WORKER_ENABLE_QUESTION_PLANNING;
  });

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

  it("preserves safe planning diagnostics when plan_questions fails", async () => {
    buildStudyQuestionSet.mockRejectedValue(
      new PlanningError(ErrorCode.MODEL_OUTPUT_INVALID, "Model returned invalid JSON.", {
        reason: "message_content_invalid_json",
        alias: "worker-p2-reasoning",
      }),
    );

    const rpc = vi.fn(async (fn: string) => {
      if (fn === "hive3_p15_worker_get_processing_context") {
        return {
          data: {
            study_run: {
              id: "run-1",
              hive_id: "hive-1",
              status: StudyRunStatus.QUEUED,
              stage: StudyRunStage.ENQUEUE,
              intent_id: "intent-1",
            },
            owner_user_id: "owner-1",
            intent_request_text: "Summarize progress",
          },
          error: null,
        };
      }
      if (fn === "hive3_p1p_worker_transition_study_run") {
        return {
          data: { status: StudyRunStatus.FAILED, stage: StudyRunStage.PLAN_QUESTIONS },
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
        correlation_id: "corr-plan",
      }),
    ).rejects.toMatchObject({
      name: "ProcessStudyRunError",
      errorCode: ErrorCode.MODEL_OUTPUT_INVALID,
      retryable: false,
      messageSafe: "Model returned invalid JSON.",
      diagnostics: {
        reason: "message_content_invalid_json",
        alias: "worker-p2-reasoning",
      },
    } satisfies Partial<ProcessStudyRunError>);
  });

  it("preserves retryable planning diagnostics for gateway failures", async () => {
    buildStudyQuestionSet.mockRejectedValue(
      new PlanningError(ErrorCode.MODEL_UNAVAILABLE, "Reasoning gateway returned an error.", {
        reason: "gateway_status",
        status: 503,
        alias: "worker-p2-reasoning",
      }),
    );

    const rpc = vi.fn(async (fn: string) => {
      if (fn === "hive3_p15_worker_get_processing_context") {
        return {
          data: {
            study_run: {
              id: "run-1",
              hive_id: "hive-1",
              status: StudyRunStatus.QUEUED,
              stage: StudyRunStage.ENQUEUE,
              intent_id: "intent-1",
            },
            owner_user_id: "owner-1",
            intent_request_text: "Summarize progress",
          },
          error: null,
        };
      }
      if (fn === "hive3_p1p_worker_transition_study_run") {
        return {
          data: { status: StudyRunStatus.RUNNING, stage: StudyRunStage.PLAN_QUESTIONS },
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
        correlation_id: "corr-retry",
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.MODEL_UNAVAILABLE,
      retryable: true,
      diagnostics: {
        reason: "gateway_status",
        status: 503,
        alias: "worker-p2-reasoning",
      },
    });
  });
});
