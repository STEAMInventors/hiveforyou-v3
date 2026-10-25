import type { StudyRunSafeV1 } from "@hiveforyou/contracts/study-runs/v1";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HiveProgressModal } from "@/components/workspace/HiveProgressModal";

function baseRun(overrides: Partial<StudyRunSafeV1> = {}): StudyRunSafeV1 {
  return {
    id: "run-1",
    hive_id: "hive-1",
    intent_id: "intent-1",
    status: "RUNNING",
    stage: "extract",
    trigger: "generate",
    correlation_id: "corr-1",
    started_at: "2026-10-24T10:00:00.000Z",
    finished_at: null,
    error_code: null,
    error_message_safe: null,
    created_at: "2026-10-24T10:00:00.000Z",
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function counts(finished: number, unusable = 0, total = 8) {
  return { documents_total: total, documents_finished: finished, documents_unusable: unusable };
}

const NAMES = ["Annual IEP.pdf", "Speech evaluation.pdf", "Prior written notice.pdf"];

function dispatchKey(key: string, init: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
}

describe("HiveProgressModal (Living Hive)", () => {
  let mount: HTMLDivElement;
  let root: Root;
  let returnFocus: HTMLButtonElement;
  let reduced: boolean;

  beforeEach(() => {
    document.body.innerHTML = "";
    reduced = false;
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduce") ? reduced : false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    returnFocus = document.createElement("button");
    returnFocus.type = "button";
    returnFocus.textContent = "Continue";
    document.body.append(returnFocus);
    mount = document.createElement("div");
    document.body.append(mount);
    root = createRoot(mount);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  const handlers = { onMinimize: vi.fn(), onViewResults: vi.fn(), onRetry: vi.fn() };

  function render(props: Partial<React.ComponentProps<typeof HiveProgressModal>> = {}) {
    act(() => {
      root.render(
        <HiveProgressModal
          open
          run={baseRun()}
          hiveName="Maya's IEP 2025–26"
          documentCount={8}
          documentNames={NAMES}
          pollState="ok"
          lastPollSuccessAt={Date.now()}
          returnFocusRef={{ current: returnFocus }}
          onMinimize={handlers.onMinimize}
          onViewResults={handlers.onViewResults}
          {...props}
        />,
      );
    });
  }

  const q = (testId: string) => document.querySelector(`[data-testid="${testId}"]`);
  const text = (testId: string) => q(testId)?.textContent ?? null;
  const honeycomb = () => q("progress-honeycomb");
  const title = () => document.querySelector("h2")?.textContent;

  it("traps forward and reverse Tab within the overlay", () => {
    render();
    const overlay = q("hive-progress-overlay") as HTMLElement;
    (q("progress-minimize") as HTMLButtonElement).focus();
    dispatchKey("Tab");
    expect(overlay.contains(document.activeElement)).toBe(true);
    dispatchKey("Tab", { shiftKey: true });
    expect(overlay.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(returnFocus);
  });

  it("minimizes on Escape and restores focus; survives an unmounted trigger", () => {
    handlers.onMinimize.mockClear();
    render();
    returnFocus.focus();
    act(() => dispatchKey("Escape"));
    expect(handlers.onMinimize).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(returnFocus);
    returnFocus.remove();
    expect(() => act(() => dispatchKey("Escape"))).not.toThrow();
  });

  it("renders the prototype layout with the Hive name and Run in background while active", () => {
    render();
    expect(document.body.textContent).toContain("Maya's IEP 2025–26");
    expect(title()).toBe("Reading your documents");
    expect(text("progress-sub")).toBe(
      "HiveForYou is identifying each document and pulling out the facts. This can take a few minutes.",
    );
    expect(text("progress-minimize")).toBe("Run in background");
    expect(document.body.textContent).toContain("You can close this. HiveForYou keeps working.");
    expect(honeycomb()?.getAttribute("data-mode")).toBe("processing");
    expect(q("progress-motion-reduced")).toBeNull();
  });

  it("uses a still mark while queued", () => {
    render({ run: baseRun({ status: "QUEUED", stage: "enqueue" }) });
    expect(honeycomb()?.getAttribute("data-mode")).toBe("still");
    expect(title()).toBe("Getting started");
  });

  it("shows no counter before the first durable finished marker (and never for pack-free runs)", () => {
    render({ readingProgress: null });
    expect(q("progress-counter")).toBeNull();
    render({ readingProgress: counts(0) });
    expect(q("progress-counter")).toBeNull();
    expect(text("progress-docs-summary")).toBe("3 documents");
  });

  it("shows the real count, one segment per document, and real filenames without per-row status", () => {
    render({ readingProgress: counts(3) });
    expect(text("progress-count")).toBe("3");
    expect(text("progress-counter")).toContain("of 8 documents read");
    const segments = [...document.querySelectorAll('[data-testid="progress-segment"]')];
    expect(segments).toHaveLength(8);
    expect(segments.filter((s) => s.getAttribute("data-on") === "true")).toHaveLength(3);
    expect(q("progress-segments")?.getAttribute("aria-valuenow")).toBe("3");
    expect(q("progress-segments")?.getAttribute("aria-valuemax")).toBe("8");
    expect(text("progress-docs-summary")).toBe("3 of 8 read");
    const rows = [...document.querySelectorAll('[data-testid="progress-docs"] li')].map((li) => li.textContent);
    expect(rows).toEqual(NAMES);
    expect(document.body.textContent).not.toMatch(/Queued|Waiting|Reading\b(?! your)|Couldn.t read|%/);
  });

  it("expands and collapses the document list", () => {
    render();
    const toggle = q("progress-docs-toggle") as HTMLButtonElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    act(() => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(q("progress-docs")).toBeNull();
  });

  it("counts unreadable documents separately and never as read", () => {
    render({ readingProgress: counts(5, 1) });
    expect(text("progress-count")).toBe("4");
    expect(text("progress-docs-summary")).toBe("4 of 8 read");
  });

  it("says all documents are read only when every marker is in and none was unusable", () => {
    render({ readingProgress: counts(8) });
    expect(title()).toBe("All 8 documents are read");
    expect(text("progress-sub")).toBe("Wrapping up the reading stage.");
    render({ readingProgress: counts(8, 1) });
    expect(title()).toBe("Reading finished");
  });

  it("announces one live line per arrival with the real delta, and pulses the counter", () => {
    vi.useFakeTimers();
    render({ readingProgress: counts(2) });
    expect(text("progress-live")).toBe("");

    render({
      readingProgress: counts(3),
      readingArrival: { runId: "run-1", seq: 1, kind: "single", finished: 3 },
    });
    expect(text("progress-live")).toBe("Another document is read.");
    expect(text("progress-chip")).toBe("+1");
    expect(q("progress-count")?.className).toContain("hfy-lh-count--pulse");
    expect((q("progress-count") as HTMLElement).style.getPropertyValue("--lh-pulse")).toBe("#F6B826");

    render({
      readingProgress: counts(6),
      readingArrival: { runId: "run-1", seq: 2, kind: "batch", finished: 6 },
    });
    expect(text("progress-live")).toBe("3 more documents are read.");
    expect(text("progress-chip")).toBe("+3");
    expect((q("progress-count") as HTMLElement).style.getPropertyValue("--lh-pulse")).toBe("#2F6FE4");

    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(q("progress-chip")).toBeNull();
    expect(q("progress-count")?.className).not.toContain("hfy-lh-count--pulse");
  });

  it("reports an unreadable arrival without a +N chip", () => {
    render({ readingProgress: counts(3) });
    render({
      readingProgress: counts(4, 1),
      readingArrival: { runId: "run-1", seq: 1, kind: "single", finished: 4 },
    });
    expect(text("progress-live")).toBe("1 document couldn't be read.");
    expect(q("progress-chip")).toBeNull();
  });

  it("ignores arrivals for another run, and never replays an arrival present when the modal opens", () => {
    render({
      readingProgress: counts(4),
      readingArrival: { runId: "run-1", seq: 3, kind: "single", finished: 4 },
    });
    expect(text("progress-live")).toBe("");
    expect(honeycomb()?.getAttribute("data-effect")).toBe("none");
    render({
      readingProgress: counts(4),
      readingArrival: { runId: "run-other", seq: 9, kind: "batch", finished: 6 },
    });
    expect(text("progress-live")).toBe("");
    expect(honeycomb()?.getAttribute("data-effect")).toBe("none");
  });

  it("moves from reading to finishing up with a sync, green segments and a truthful next stage", () => {
    render({ readingProgress: counts(8) });
    render({ run: baseRun({ stage: "finalize" }), readingProgress: counts(8) });
    expect(honeycomb()?.getAttribute("data-effect")).toBe("sync");
    expect(text("progress-live")).toBe("Reading complete. Moving on to finishing up.");
    expect(title()).toBe("Finishing up");
    expect(text("progress-sub")).toContain("Your study isn't finished yet.");
    const segment = q("progress-segment") as HTMLElement;
    expect(segment.style.background).toMatch(/2FA35A|rgb\(47, 163, 90\)/i);
    const active = document.querySelector('[data-testid="progress-steps"] [aria-current="step"]');
    expect(active?.textContent).toContain("Finishing up");
  });

  it("does not sync when opened already past reading", () => {
    render({ run: baseRun({ stage: "finalize" }) });
    expect(honeycomb()?.getAttribute("data-effect")).toBe("none");
    expect(honeycomb()?.getAttribute("data-lights")).toBe("2");
  });

  it("uses the real stage names in the step row, never unbuilt stages", () => {
    render();
    const labels = [...document.querySelectorAll('[data-testid="progress-steps"] li')].map((li) =>
      li.getAttribute("data-state"),
    );
    expect(labels).toEqual(["done", "done", "done", "done", "active", "pending"]);
    expect(document.body.textContent).not.toMatch(/Connecting findings|Checking sources|Preparing your study/);
  });

  it("success holds still with honest copy: no Canonical Study claim", () => {
    render({ readingProgress: counts(8) });
    render({ run: baseRun({ status: "SUCCEEDED", stage: "finalize" }), readingProgress: counts(8) });
    expect(title()).toBe("Analysis complete");
    expect(text("progress-sub")).toContain("Nothing here is a verified finding yet");
    expect(text("progress-live")).toBe("Done.");
    expect(honeycomb()?.getAttribute("data-mode")).toBe("success");
    expect(honeycomb()?.getAttribute("data-effect")).toBe("hold");
    expect(text("progress-view-results")).toBe("View results");
    expect(document.body.textContent).not.toMatch(/Your study is ready|Open my study|links back to its source/);
    const overlay = q("hive-progress-overlay") as HTMLElement;
    (q("progress-view-results") as HTMLButtonElement).focus();
    dispatchKey("Tab");
    expect(overlay.contains(document.activeElement)).toBe(true);
  });

  it("failure rests in grey, keeps the safe message and counts, and offers only supported recovery", () => {
    handlers.onRetry.mockClear();
    render({ readingProgress: counts(5) });
    render({
      run: baseRun({ status: "FAILED", error_message_safe: "2 of 8 documents could not be extracted." }),
      readingProgress: counts(5),
      onRetry: handlers.onRetry,
    });
    expect(title()).toBe("Analysis didn't finish");
    expect(text("progress-sub")).toBe("5 of 8 documents are read and saved.");
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("2 of 8 documents could not be extracted.");
    expect(honeycomb()?.getAttribute("data-mode")).toBe("failed");
    expect(honeycomb()?.getAttribute("data-effect")).toBe("rest");
    expect(text("progress-help")).toContain("Try again. Your documents are still in your Hive.");
    expect(document.querySelector('[data-testid="progress-steps"] [data-state="stopped"]')?.textContent).toContain(
      "Reading your documents",
    );
    expect(text("progress-back")).toBe("Back to my Hive");
    act(() => (q("progress-retry") as HTMLButtonElement).click());
    expect(handlers.onRetry).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toMatch(/won.t be read twice|Nothing was lost/);
  });

  it("hides Try again when a new analysis is not allowed, and shows a retry error only after trying", () => {
    render({ run: baseRun({ status: "FAILED" }), onRetry: null, retryError: "Old error" });
    expect(q("progress-retry")).toBeNull();
    expect(q("progress-retry-error")).toBeNull();
    render({ run: baseRun({ status: "FAILED" }), onRetry: handlers.onRetry, retryError: "Could not start." });
    act(() => (q("progress-retry") as HTMLButtonElement).click());
    expect(text("progress-retry-error")).toBe("Could not start.");
    render({ run: baseRun({ status: "FAILED" }), onRetry: handlers.onRetry, retryBusy: true });
    expect((q("progress-retry") as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps reconnect and session-expired messaging with the last known counts", () => {
    render({ pollState: "reconnecting", readingProgress: counts(5) });
    expect(document.body.textContent).toContain("We're having trouble reaching HiveForYou");
    expect(text("progress-count")).toBe("5");
    render({ pollState: "auth_expired", readingProgress: counts(5) });
    expect(document.body.textContent).toContain("Your session expired.");
  });

  it("uses extract-specific stale copy, and a newly finished document counts as fresh activity", () => {
    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    render({ run: baseRun({ updated_at: old }) });
    expect(document.body.textContent).toContain("Reading can take several minutes per document.");
    render({ run: baseRun({ updated_at: old }), readingProgress: counts(2), readingProgressObservedAt: Date.now() });
    expect(document.body.textContent).not.toContain("Reading can take several minutes per document.");
  });

  it("shows the recorded question count after question planning", () => {
    render({ run: baseRun({ stage: "plan_questions" }), questionCount: 4 });
    expect(q("progress-questions")).toBeNull();
    render({ run: baseRun({ stage: "load_sources" }), questionCount: 4 });
    expect(text("progress-questions")).toBe("We'll look for answers to 4 questions.");
  });

  it("under reduced motion: still mark, no counter animation, and a spoken working line", () => {
    reduced = true;
    render({ readingProgress: counts(2) });
    expect(q("progress-motion-reduced")?.textContent).toBe("Motion reduced");
    expect(honeycomb()?.getAttribute("data-motion")).toBe("still");
    expect(text("progress-live")).toBe("Working: reading your documents.");
    render({
      readingProgress: counts(3),
      readingArrival: { runId: "run-1", seq: 1, kind: "single", finished: 3 },
    });
    expect(text("progress-count")).toBe("3");
    expect(text("progress-live")).toBe("Another document is read.");
    expect(q("progress-count")?.className).not.toContain("hfy-lh-count--pulse");
    expect(q("progress-chip")?.className).not.toContain("hfy-lh-chip--show");
    expect(honeycomb()?.getAttribute("data-effect")).toBe("none");
  });

  it("remounts for a new run so nothing from the previous run replays", () => {
    render({ readingProgress: counts(3) });
    render({
      run: baseRun({ id: "run-2", status: "RUNNING", stage: "enqueue" }),
      readingProgress: null,
      readingArrival: { runId: "run-2", seq: 1, kind: "single", finished: 1 },
    });
    expect(title()).toBe("Getting started");
    expect(text("progress-live")).toBe("");
  });
});
