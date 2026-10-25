import type { PackExtractionProgressV1 } from "@hiveforyou/contracts/pack-extraction/v1";
import type { StudyRunSafeV1 } from "@hiveforyou/contracts/study-runs/v1";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchHiveProcessingHandoff,
  fetchStudyRunExtractionProgress,
  fetchStudyRunStatus,
} from "@/lib/study-runs/client";
import { type HiveStudyRun, useHiveStudyRun } from "@/lib/study-runs/use-hive-study-run";

vi.mock("@/lib/study-runs/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/study-runs/client")>()),
  fetchHiveProcessingHandoff: vi.fn(),
  fetchStudyRunStatus: vi.fn(),
  fetchStudyRunExtractionProgress: vi.fn(),
  submitStudyRun: vi.fn(),
}));

const handoffMock = vi.mocked(fetchHiveProcessingHandoff);
const statusMock = vi.mocked(fetchStudyRunStatus);
const progressMock = vi.mocked(fetchStudyRunExtractionProgress);

function run(overrides: Partial<StudyRunSafeV1> = {}): StudyRunSafeV1 {
  return {
    id: "run-1",
    hive_id: "hive-1",
    intent_id: "intent-1",
    status: "RUNNING",
    stage: "extract",
    trigger: "study",
    correlation_id: "corr-1",
    started_at: "2026-10-25T10:00:00.000Z",
    finished_at: null,
    error_code: null,
    error_message_safe: null,
    created_at: "2026-10-25T10:00:00.000Z",
    updated_at: "2026-10-25T10:05:00.000Z",
    ...overrides,
  };
}

function progress(finished: number, studyRunId = "run-1"): PackExtractionProgressV1 {
  return {
    contract_version: "pack-extraction-progress@1",
    study_run_id: studyRunId,
    hive_id: "hive-1",
    documents_total: 8,
    documents_finished: finished,
    documents_unusable: 0,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const POLL_MS = 3000;
const PROGRESS_MS = 15_000;

describe("useHiveStudyRun live progress events and status ordering", () => {
  let mount: HTMLDivElement;
  let root: Root;
  let study: HiveStudyRun;
  let finished: number;
  let visibility: DocumentVisibilityState;

  function Harness() {
    study = useHiveStudyRun("hive-1");
    return null;
  }

  async function advance(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  async function start() {
    act(() => {
      root.render(<Harness />);
    });
    await advance(0);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    localStorage.clear();
    finished = 3;
    visibility = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
    handoffMock.mockResolvedValue({
      study_run: run(),
      intent_request_text: "What did I spend?",
      domain_hint: null,
      planning_summary: null,
    });
    statusMock.mockImplementation(async () => ({ study_run: run(), planning_summary: null }));
    progressMock.mockImplementation(async () => progress(finished));
    mount = document.createElement("div");
    document.body.append(mount);
    root = createRoot(mount);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    vi.useRealTimers();
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  /** First poll fetches progress; that first count is only a baseline. */
  async function startWithBaseline() {
    await start();
    expect(study.progressOpen).toBe(true);
    await advance(POLL_MS);
    expect(study.readingProgress?.documents_finished).toBe(3);
    expect(study.readingArrival).toBeNull();
  }

  it("treats the first observation as a baseline, then emits one event per live increase", async () => {
    await startWithBaseline();

    finished = 4;
    await advance(PROGRESS_MS);
    expect(study.readingArrival).toMatchObject({ runId: "run-1", seq: 1, kind: "single", count: 1, finished: 4 });

    finished = 6;
    await advance(PROGRESS_MS);
    expect(study.readingArrival).toMatchObject({ seq: 2, kind: "batch", count: 2, finished: 6 });

    await advance(PROGRESS_MS);
    expect(study.readingArrival?.seq).toBe(2);
  });

  it("does not celebrate documents finished while minimized; the first fetch after reopen is a baseline", async () => {
    await startWithBaseline();
    act(() => study.minimizeProgress());
    finished = 7;
    await advance(PROGRESS_MS * 2);
    expect(study.readingProgress?.documents_finished).toBe(3);

    await act(async () => {
      study.openProgress();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(study.readingProgress?.documents_finished).toBe(7);
    expect(study.readingArrival).toBeNull();

    finished = 8;
    await advance(PROGRESS_MS);
    expect(study.readingArrival).toMatchObject({ kind: "single", finished: 8 });
  });

  it("re-baselines after a status poll failure instead of replaying the backlog on reconnect", async () => {
    await startWithBaseline();
    statusMock.mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(new Error("offline"));
    finished = 6;
    await advance(PROGRESS_MS);
    expect(study.readingProgress?.documents_finished).toBe(6);
    expect(study.readingArrival).toBeNull();
    expect(study.pollState).toBe("ok");

    finished = 7;
    await advance(PROGRESS_MS);
    expect(study.readingArrival).toMatchObject({ kind: "single", finished: 7 });
  });

  it("keeps the last counts when a progress fetch fails, and the next result is only a baseline", async () => {
    await startWithBaseline();
    progressMock.mockRejectedValueOnce(new Error("timeout"));
    finished = 4;
    await advance(PROGRESS_MS);
    expect(study.readingProgress?.documents_finished).toBe(3);
    expect(study.readingArrival).toBeNull();

    finished = 5;
    await advance(PROGRESS_MS);
    expect(study.readingProgress?.documents_finished).toBe(5);
    expect(study.readingArrival).toBeNull();
  });

  it("re-baselines after the tab was hidden", async () => {
    await startWithBaseline();
    visibility = "hidden";
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    finished = 5;
    await advance(PROGRESS_MS);
    expect(study.readingProgress?.documents_finished).toBe(5);
    expect(study.readingArrival).toBeNull();
  });

  it("ignores lower (stale) counts and progress for another run", async () => {
    await startWithBaseline();
    finished = 2;
    await advance(PROGRESS_MS);
    expect(study.readingProgress?.documents_finished).toBe(3);
    expect(study.readingArrival).toBeNull();

    progressMock.mockResolvedValueOnce(progress(8, "run-other"));
    await advance(PROGRESS_MS);
    expect(study.readingProgress?.documents_finished).toBe(3);
    expect(study.readingArrival).toBeNull();
  });

  it("emits nothing if the run finished while the progress request was in flight", async () => {
    await startWithBaseline();
    const pending = deferred<PackExtractionProgressV1>();
    progressMock.mockReturnValueOnce(pending.promise);
    await advance(PROGRESS_MS);
    statusMock.mockResolvedValueOnce({
      study_run: run({ status: "SUCCEEDED", stage: "finalize" }),
      planning_summary: null,
    });
    await advance(POLL_MS);
    expect(study.activeRun?.status).toBe("SUCCEEDED");

    await act(async () => {
      pending.resolve(progress(4));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(study.readingArrival).toBeNull();
  });

  it("reads the closing counts once when the run leaves reading, without emitting an arrival", async () => {
    await startWithBaseline();
    const callsBefore = progressMock.mock.calls.length;
    finished = 8;
    statusMock.mockImplementation(async () => ({ study_run: run({ stage: "finalize" }), planning_summary: null }));
    await advance(POLL_MS);
    expect(progressMock.mock.calls.length).toBe(callsBefore + 1);
    expect(study.readingProgress?.documents_finished).toBe(8);
    expect(study.readingArrival).toBeNull();

    await advance(PROGRESS_MS * 2);
    expect(progressMock.mock.calls.length).toBe(callsBefore + 1);
  });

  it("does not fetch closing counts for a run that never reported any", async () => {
    handoffMock.mockResolvedValue({
      study_run: run({ stage: "plan_schema" }),
      intent_request_text: "What did I spend?",
      domain_hint: null,
      planning_summary: null,
    });
    statusMock.mockImplementation(async () => ({ study_run: run({ stage: "finalize" }), planning_summary: null }));
    await start();
    await advance(POLL_MS * 3);
    expect(progressMock).not.toHaveBeenCalled();
  });

  it("an older RUNNING response resolving after SUCCEEDED never regresses the finished run", async () => {
    await start();
    const older = deferred<{ study_run: StudyRunSafeV1; planning_summary: null }>();
    const newer = deferred<{ study_run: StudyRunSafeV1; planning_summary: null }>();
    statusMock.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    await advance(POLL_MS * 2);

    await act(async () => {
      newer.resolve({ study_run: run({ status: "SUCCEEDED", stage: "finalize" }), planning_summary: null });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(study.activeRun?.status).toBe("SUCCEEDED");
    expect(study.locked).toBe(false);

    await act(async () => {
      older.resolve({ study_run: run({ status: "RUNNING", stage: "extract" }), planning_summary: null });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(study.activeRun?.status).toBe("SUCCEEDED");
    expect(study.activeRun?.stage).toBe("finalize");
    expect(study.locked).toBe(false);

    const calls = statusMock.mock.calls.length;
    await advance(POLL_MS * 3);
    expect(statusMock.mock.calls.length).toBe(calls);
  });

  it("an older response cannot move the stage backward", async () => {
    await start();
    const older = deferred<{ study_run: StudyRunSafeV1; planning_summary: null }>();
    const newer = deferred<{ study_run: StudyRunSafeV1; planning_summary: null }>();
    statusMock.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    await advance(POLL_MS * 2);

    await act(async () => {
      newer.resolve({ study_run: run({ stage: "finalize" }), planning_summary: null });
      older.resolve({ study_run: run({ stage: "extract" }), planning_summary: null });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(study.activeRun?.stage).toBe("finalize");
  });

  it("applies sequential responses in order, including a terminal one", async () => {
    await start();
    statusMock
      .mockResolvedValueOnce({ study_run: run({ stage: "extract" }), planning_summary: null })
      .mockResolvedValueOnce({ study_run: run({ stage: "finalize" }), planning_summary: null })
      .mockResolvedValueOnce({ study_run: run({ status: "FAILED", stage: "finalize" }), planning_summary: null });
    await advance(POLL_MS);
    expect(study.activeRun?.stage).toBe("extract");
    await advance(POLL_MS);
    expect(study.activeRun?.stage).toBe("finalize");
    await advance(POLL_MS);
    expect(study.activeRun?.status).toBe("FAILED");
  });

  it("late failures from older polls do not count toward reconnecting after a newer success", async () => {
    await start();
    const stale = [deferred<never>(), deferred<never>(), deferred<never>()];
    statusMock
      .mockReturnValueOnce(stale[0]!.promise)
      .mockReturnValueOnce(stale[1]!.promise)
      .mockReturnValueOnce(stale[2]!.promise);
    await advance(POLL_MS * 4);
    expect(study.pollState).toBe("ok");

    await act(async () => {
      for (const d of stale) {
        d.reject(new Error("late"));
      }
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(study.pollState).toBe("ok");
    expect(study.statusNote).toBeNull();
  });

  it("still reports reconnecting for genuine consecutive failures and recovers on success", async () => {
    await start();
    statusMock
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("offline"));
    await advance(POLL_MS * 3);
    expect(study.pollState).toBe("reconnecting");
    await advance(POLL_MS);
    expect(study.pollState).toBe("ok");
    expect(study.activeRun?.status).toBe("RUNNING");
  });
});
