// @vitest-environment node

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorCode, StudyRunStatus } from "@hiveforyou/contracts/errors/v1";
import { STUDY_RUN_QUEUED_EVENT } from "@hiveforyou/contracts/study-runs/v1";

const submitStudyProcessing = vi.fn();
const sendStudyRunQueuedEvent = vi.fn();
const requireAuthenticatedUser = vi.fn();
const createServerSupabaseClient = vi.fn();

vi.mock("@/lib/study-runs/repository", () => ({
  submitStudyProcessing,
  getStudyRunForOwner: vi.fn(),
  getStudyRunPlanningSummaryForOwner: vi.fn(),
  getHiveProcessingHandoff: vi.fn(),
}));

vi.mock("@/lib/inngest/send-study-run-queued", () => ({
  sendStudyRunQueuedEvent,
}));

vi.mock("@/lib/supabase/server", () => ({
  requireAuthenticatedUser,
  createServerSupabaseClient,
}));

vi.mock("@/lib/server/log", () => ({
  logServerEvent: vi.fn(),
}));

const hiveId = "11111111-1111-4111-8111-111111111111";
const studyRunId = "cda6fab3-ff62-4104-955f-feb2355f5351";
const correlationId = "corr-submit-test";
const deliveryKey = "delivery-retry-1";

type StudyRunRoutesModule = typeof import("./study-run-routes");
let studyRunRoutesModule: StudyRunRoutesModule | null = null;

async function loadStudyRunRoutes(): Promise<StudyRunRoutesModule> {
  if (!studyRunRoutesModule) {
    studyRunRoutesModule = await import("./study-run-routes");
  }
  return studyRunRoutesModule;
}

beforeAll(async () => {
  await loadStudyRunRoutes();
}, 20_000);

function mockStudyRun(status: string) {
  return {
    id: studyRunId,
    hive_id: hiveId,
    intent_id: "22222222-2222-4222-8222-222222222222",
    status,
    stage: "enqueue",
    trigger: "study",
    correlation_id: correlationId,
    started_at: null,
    finished_at: null,
    error_code: null,
    error_message_safe: null,
    created_at: "2026-10-23T00:00:00.000Z",
    updated_at: "2026-10-23T00:00:00.000Z",
  };
}

describe("handleSubmitStudyProcessing Inngest handoff", () => {
  beforeEach(() => {
    submitStudyProcessing.mockReset();
    sendStudyRunQueuedEvent.mockReset();
    requireAuthenticatedUser.mockReset();
    createServerSupabaseClient.mockReset();
    requireAuthenticatedUser.mockResolvedValue({ ok: true, userId: "user-1" });
    createServerSupabaseClient.mockResolvedValue({});
    sendStudyRunQueuedEvent.mockResolvedValue(undefined);
  });

  it("re-enqueues Inngest when submit is an idempotent replay and the run is still QUEUED", async () => {
    submitStudyProcessing.mockResolvedValue({
      ok: true,
      data: {
        study_run: mockStudyRun(StudyRunStatus.QUEUED),
        idempotent_replay: true,
      },
    });

    const { handleSubmitStudyProcessing } = await loadStudyRunRoutes();
    const response = await handleSubmitStudyProcessing(correlationId, hiveId, {
      request_text: "What changed since the last plan?",
      trigger: "study",
      idempotency_key: deliveryKey,
    });

    expect(response.status).toBe(202);
    expect(sendStudyRunQueuedEvent).toHaveBeenCalledOnce();
    expect(sendStudyRunQueuedEvent).toHaveBeenCalledWith({
      name: STUDY_RUN_QUEUED_EVENT,
      data: {
        study_run_id: studyRunId,
        hive_id: hiveId,
        correlation_id: correlationId,
        delivery_idempotency_key: deliveryKey,
      },
    });
  });

  it("does not re-enqueue when idempotent replay returns a terminal run", async () => {
    submitStudyProcessing.mockResolvedValue({
      ok: true,
      data: {
        study_run: mockStudyRun(StudyRunStatus.SUCCEEDED),
        idempotent_replay: true,
      },
    });

    const { handleSubmitStudyProcessing } = await loadStudyRunRoutes();
    const response = await handleSubmitStudyProcessing(correlationId, hiveId, {
      request_text: "What changed since the last plan?",
      trigger: "study",
      idempotency_key: deliveryKey,
    });

    expect(response.status).toBe(202);
    expect(sendStudyRunQueuedEvent).not.toHaveBeenCalled();
  });

  it("returns dependency error when Inngest send fails after submit persisted", async () => {
    submitStudyProcessing.mockResolvedValue({
      ok: true,
      data: {
        study_run: mockStudyRun(StudyRunStatus.QUEUED),
        idempotent_replay: false,
      },
    });
    sendStudyRunQueuedEvent.mockRejectedValue(new Error("INNGEST_EVENT_KEY is not configured."));

    const { handleSubmitStudyProcessing } = await loadStudyRunRoutes();
    const response = await handleSubmitStudyProcessing(correlationId, hiveId, {
      request_text: "What changed since the last plan?",
      trigger: "study",
      idempotency_key: deliveryKey,
    });

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error_code).toBe(ErrorCode.DEPENDENCY_UNAVAILABLE);
    expect(body.retryable).toBe(true);
  });
});
