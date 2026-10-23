// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { STUDY_RUN_QUEUED_EVENT } from "@hiveforyou/contracts/study-runs/v1";

vi.mock("server-only", () => ({}));

const send = vi.fn();
const setEventKey = vi.fn();

vi.mock("./client", () => ({
  inngest: {
    send,
    setEventKey,
  },
}));

describe("sendStudyRunQueuedEvent", () => {
  beforeEach(() => {
    vi.resetModules();
    send.mockReset();
    setEventKey.mockReset();
    delete process.env.INNGEST_EVENT_KEY;
  });

  it("requires INNGEST_EVENT_KEY before calling the SDK", async () => {
    const { sendStudyRunQueuedEvent } = await import("./send-study-run-queued");
    await expect(
      sendStudyRunQueuedEvent({
        name: STUDY_RUN_QUEUED_EVENT,
        data: {
          study_run_id: "run-1",
          hive_id: "hive-1",
          correlation_id: "corr-1",
          delivery_idempotency_key: "delivery-1",
        },
      }),
    ).rejects.toThrow("INNGEST_EVENT_KEY is not configured.");
    expect(setEventKey).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("binds the event key and uses the delivery idempotency key as the stable Inngest event id", async () => {
    process.env.INNGEST_EVENT_KEY = " test-event-key ";
    send.mockResolvedValue({ ids: ["evt_abc"] });

    const { sendStudyRunQueuedEvent } = await import("./send-study-run-queued");
    await sendStudyRunQueuedEvent({
      name: STUDY_RUN_QUEUED_EVENT,
      data: {
        study_run_id: "run-1",
        hive_id: "hive-1",
        correlation_id: "corr-1",
        delivery_idempotency_key: "delivery-1",
      },
    });

    expect(setEventKey).toHaveBeenCalledWith("test-event-key");
    expect(send).toHaveBeenCalledWith({
      name: STUDY_RUN_QUEUED_EVENT,
      data: {
        study_run_id: "run-1",
        hive_id: "hive-1",
        correlation_id: "corr-1",
        delivery_idempotency_key: "delivery-1",
      },
      id: "delivery-1",
    });
  });

  it("surfaces an empty ids response as a send failure", async () => {
    process.env.INNGEST_EVENT_KEY = "test-event-key";
    send.mockResolvedValue({ ids: [] });

    const { sendStudyRunQueuedEvent } = await import("./send-study-run-queued");
    await expect(
      sendStudyRunQueuedEvent({
        name: STUDY_RUN_QUEUED_EVENT,
        data: {
          study_run_id: "run-1",
          hive_id: "hive-1",
          correlation_id: "corr-1",
          delivery_idempotency_key: "delivery-1",
        },
      }),
    ).rejects.toThrow("Inngest accepted the request but returned no event ids.");
  });
});
