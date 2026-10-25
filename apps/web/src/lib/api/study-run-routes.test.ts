// @vitest-environment node

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorCode, StudyRunStatus } from "@hiveforyou/contracts/errors/v1";
import { STUDY_RUN_QUEUED_EVENT } from "@hiveforyou/contracts/study-runs/v1";

const submitStudyProcessing = vi.fn();
const sendStudyRunQueuedEvent = vi.fn();
const requireAuthenticatedUser = vi.fn();
const createServerSupabaseClient = vi.fn();
const getStudyRunExtractionForOwner = vi.fn();
const getStudyRunExtractionProgressForOwner = vi.fn();

vi.mock("@/lib/study-runs/repository", () => ({
  submitStudyProcessing,
  getStudyRunExtractionForOwner,
  getStudyRunExtractionProgressForOwner,
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

describe("handleGetStudyRunExtraction", () => {
  const ownerView = {
    contract_version: "pack-extraction-owner-view@1",
    study_run_id: studyRunId,
    hive_id: hiveId,
    batches: [],
  };

  beforeEach(() => {
    getStudyRunExtractionForOwner.mockReset();
    requireAuthenticatedUser.mockReset();
    createServerSupabaseClient.mockReset();
    requireAuthenticatedUser.mockResolvedValue({ ok: true, userId: "user-1" });
    createServerSupabaseClient.mockResolvedValue({});
  });

  it("returns the persisted owner view for the owner's run", async () => {
    getStudyRunExtractionForOwner.mockResolvedValue({ ok: true, data: ownerView });
    const { handleGetStudyRunExtraction } = await loadStudyRunRoutes();
    const response = await handleGetStudyRunExtraction(correlationId, hiveId, studyRunId);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(ownerView);
    expect(getStudyRunExtractionForOwner).toHaveBeenCalledWith({}, studyRunId);
  });

  it("rejects malformed ids before any database call", async () => {
    const { handleGetStudyRunExtraction } = await loadStudyRunRoutes();
    const response = await handleGetStudyRunExtraction(correlationId, hiveId, "not-a-uuid");
    expect(response.status).toBe(400);
    expect(getStudyRunExtractionForOwner).not.toHaveBeenCalled();
  });

  it("requires sign-in", async () => {
    requireAuthenticatedUser.mockResolvedValue({ ok: false });
    const { handleGetStudyRunExtraction } = await loadStudyRunRoutes();
    const response = await handleGetStudyRunExtraction(correlationId, hiveId, studyRunId);
    expect(response.status).toBe(401);
    expect(getStudyRunExtractionForOwner).not.toHaveBeenCalled();
  });

  it("denies a run from another Hive", async () => {
    getStudyRunExtractionForOwner.mockResolvedValue({
      ok: true,
      data: { ...ownerView, hive_id: "33333333-3333-4333-8333-333333333333" },
    });
    const { handleGetStudyRunExtraction } = await loadStudyRunRoutes();
    const response = await handleGetStudyRunExtraction(correlationId, hiveId, studyRunId);
    expect(response.status).toBe(403);
    expect((await response.json()).error_code).toBe(ErrorCode.ACCESS_DENIED);
  });

  it("passes through owner-check denial from the RPC", async () => {
    getStudyRunExtractionForOwner.mockResolvedValue({
      ok: false,
      error: {
        error_code: ErrorCode.ACCESS_DENIED,
        category: "authorization",
        retryable: false,
        message_safe: "You do not have access to this Hive or run.",
        diagnostic_detail: "access_denied",
      },
    });
    const { handleGetStudyRunExtraction } = await loadStudyRunRoutes();
    const response = await handleGetStudyRunExtraction(correlationId, hiveId, studyRunId);
    expect(response.status).toBe(403);
  });
});

describe("handleGetStudyRunExtractionProgress", () => {
  const progress = {
    contract_version: "pack-extraction-progress@1",
    study_run_id: studyRunId,
    hive_id: hiveId,
    documents_total: 8,
    documents_finished: 3,
    documents_unusable: 0,
  };

  beforeEach(() => {
    getStudyRunExtractionProgressForOwner.mockReset();
    requireAuthenticatedUser.mockReset();
    createServerSupabaseClient.mockReset();
    requireAuthenticatedUser.mockResolvedValue({ ok: true, userId: "user-1" });
    createServerSupabaseClient.mockResolvedValue({});
  });

  it("returns counts only for the owner's run", async () => {
    getStudyRunExtractionProgressForOwner.mockResolvedValue({ ok: true, data: progress });
    const { handleGetStudyRunExtractionProgress } = await loadStudyRunRoutes();
    const response = await handleGetStudyRunExtractionProgress(correlationId, hiveId, studyRunId);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(progress);
    expect(getStudyRunExtractionProgressForOwner).toHaveBeenCalledWith({}, studyRunId);
  });

  it("rejects malformed ids before any database call", async () => {
    const { handleGetStudyRunExtractionProgress } = await loadStudyRunRoutes();
    const response = await handleGetStudyRunExtractionProgress(correlationId, "bad", studyRunId);
    expect(response.status).toBe(400);
    expect(getStudyRunExtractionProgressForOwner).not.toHaveBeenCalled();
  });

  it("requires sign-in", async () => {
    requireAuthenticatedUser.mockResolvedValue({ ok: false });
    const { handleGetStudyRunExtractionProgress } = await loadStudyRunRoutes();
    const response = await handleGetStudyRunExtractionProgress(correlationId, hiveId, studyRunId);
    expect(response.status).toBe(401);
    expect(getStudyRunExtractionProgressForOwner).not.toHaveBeenCalled();
  });

  it("denies a run from another Hive", async () => {
    getStudyRunExtractionProgressForOwner.mockResolvedValue({
      ok: true,
      data: { ...progress, hive_id: "33333333-3333-4333-8333-333333333333" },
    });
    const { handleGetStudyRunExtractionProgress } = await loadStudyRunRoutes();
    const response = await handleGetStudyRunExtractionProgress(correlationId, hiveId, studyRunId);
    expect(response.status).toBe(403);
    expect((await response.json()).error_code).toBe(ErrorCode.ACCESS_DENIED);
  });

  it("returns a safe dependency error when the RPC is missing or malformed", async () => {
    getStudyRunExtractionProgressForOwner.mockResolvedValue({
      ok: false,
      error: {
        error_code: ErrorCode.DEPENDENCY_UNAVAILABLE,
        category: "dependency",
        retryable: false,
        message_safe: "Reading progress could not be loaded.",
        diagnostic_detail: "progress_malformed",
      },
    });
    const { handleGetStudyRunExtractionProgress } = await loadStudyRunRoutes();
    const response = await handleGetStudyRunExtractionProgress(correlationId, hiveId, studyRunId);
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error_code).toBe(ErrorCode.DEPENDENCY_UNAVAILABLE);
    expect(JSON.stringify(body)).not.toContain("progress_malformed");
  });
});
