import type { StudyRunSafeV1 } from "@hiveforyou/contracts/study-runs/v1";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HiveProgressModal } from "@/components/workspace/HiveProgressModal";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} data-testid="brand-image" />,
}));

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
    updated_at: "2026-10-24T10:05:00.000Z",
    ...overrides,
  };
}

function dispatchKey(key: string, init: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
}

describe("HiveProgressModal accessibility", () => {
  let mount: HTMLDivElement;
  let root: Root;
  let returnFocus: HTMLButtonElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    returnFocus = document.createElement("button");
    returnFocus.type = "button";
    returnFocus.id = "return-focus";
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
    document.body.innerHTML = "";
  });

  function renderModal(run: StudyRunSafeV1) {
    const returnFocusRef = { current: returnFocus };
    const onMinimize = vi.fn();
    const onViewResults = vi.fn();

    act(() => {
      root.render(
        <HiveProgressModal
          open
          run={run}
          documentCount={3}
          pollState="ok"
          lastPollSuccessAt={Date.now()}
          returnFocusRef={returnFocusRef}
          onMinimize={onMinimize}
          onViewResults={onViewResults}
        />,
      );
    });

    return { onMinimize, onViewResults, returnFocusRef };
  }

  it("traps forward and reverse Tab within the overlay for an active run", () => {
    renderModal(baseRun());

    const overlay = document.querySelector('[data-testid="hive-progress-overlay"]') as HTMLElement;
    const minimize = document.querySelector('[data-testid="progress-minimize"]') as HTMLButtonElement;
    expect(overlay).toBeTruthy();
    minimize.focus();

    dispatchKey("Tab");
    expect(overlay.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(returnFocus);

    dispatchKey("Tab", { shiftKey: true });
    expect(overlay.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(returnFocus);
  });

  it("traps Tab when success footer shows two actions", () => {
    renderModal(baseRun({ status: "SUCCEEDED", stage: "finalize", finished_at: "2026-10-24T11:00:00.000Z" }));

    const overlay = document.querySelector('[data-testid="hive-progress-overlay"]') as HTMLElement;
    const viewResults = document.querySelector('[data-testid="progress-view-results"]') as HTMLButtonElement;
    viewResults.focus();

    dispatchKey("Tab");
    expect(overlay.contains(document.activeElement)).toBe(true);

    dispatchKey("Tab", { shiftKey: true });
    expect(overlay.contains(document.activeElement)).toBe(true);
  });

  it("minimizes on Escape and restores focus to the triggering control", () => {
    const { onMinimize } = renderModal(baseRun());
    returnFocus.focus();

    act(() => {
      dispatchKey("Escape");
    });

    expect(onMinimize).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(returnFocus);
  });

  it("does not throw when Escape fires after the triggering control unmounted", () => {
    const { onMinimize, returnFocusRef } = renderModal(baseRun());
    returnFocus.remove();

    expect(() => {
      act(() => {
        dispatchKey("Escape");
      });
    }).not.toThrow();

    expect(onMinimize).toHaveBeenCalledTimes(1);
    expect(returnFocusRef.current?.isConnected).toBe(false);
  });

  function rerender(props: Partial<React.ComponentProps<typeof HiveProgressModal>>) {
    act(() => {
      root.render(
        <HiveProgressModal
          open
          run={baseRun()}
          documentCount={3}
          pollState="ok"
          lastPollSuccessAt={Date.now()}
          returnFocusRef={{ current: returnFocus }}
          onMinimize={vi.fn()}
          onViewResults={vi.fn()}
          {...props}
        />,
      );
    });
  }

  const honeycomb = () => document.querySelector('[data-testid="progress-honeycomb"]');

  it("uses the static brand mark while queued and a looping honeycomb while running", () => {
    renderModal(baseRun({ status: "QUEUED", stage: "enqueue" }));
    expect(document.querySelectorAll('[data-testid="brand-image"]').length).toBe(1);
    expect(honeycomb()).toBeNull();

    rerender({ run: baseRun({ status: "RUNNING", stage: "extract" }) });
    expect(document.querySelectorAll('[data-testid="brand-image"]').length).toBe(0);
    expect(honeycomb()?.getAttribute("data-active")).toBe("true");
    expect(honeycomb()?.getAttribute("class")).toContain("hfy-mark--active");
    expect(document.querySelector(".motion-safe\\:animate-pulse")).toBeTruthy();
    expect(document.querySelector(".animate-pulse")).toBeNull();
  });

  it("stops the loop and holds the honeycomb when the run succeeds or fails", () => {
    renderModal(baseRun());
    rerender({ run: baseRun({ status: "SUCCEEDED", stage: "finalize" }) });
    expect(honeycomb()?.getAttribute("data-active")).toBe("false");
    expect(honeycomb()?.getAttribute("class")).not.toContain("hfy-mark--active");

    rerender({
      run: baseRun({ status: "FAILED", stage: "extract", error_message_safe: "2 of 8 documents could not be extracted." }),
    });
    expect(honeycomb()?.getAttribute("data-active")).toBe("false");
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("2 of 8 documents could not be extracted.");
  });

  it("shows real reading counts and stage detail during extract, and none before the first finished document", () => {
    renderModal(baseRun());
    expect(document.querySelector('[data-testid="progress-stage-detail"]')?.textContent).toContain("page by page");
    expect(document.querySelector('[data-testid="progress-reading"]')).toBeNull();

    rerender({ readingProgress: { documents_total: 8, documents_finished: 0, documents_unusable: 0 } });
    expect(document.querySelector('[data-testid="progress-reading"]')).toBeNull();

    rerender({ readingProgress: { documents_total: 8, documents_finished: 3, documents_unusable: 0 } });
    expect(document.querySelector('[data-testid="progress-reading"]')?.textContent).toBe(
      "Finished reading 3 of 8 documents.",
    );
    expect(document.body.textContent).not.toMatch(/%/);
  });

  it("shows the recorded question count after question planning", () => {
    renderModal(baseRun({ stage: "plan_questions" }));
    rerender({ run: baseRun({ stage: "plan_questions" }), questionCount: 4 });
    expect(document.querySelector('[data-testid="progress-questions"]')).toBeNull();
    rerender({ run: baseRun({ stage: "load_sources" }), questionCount: 4 });
    expect(document.querySelector('[data-testid="progress-questions"]')?.textContent).toBe(
      "We'll look for answers to 4 questions.",
    );
  });

  it("uses extract-specific stale copy, and a newly finished document counts as fresh activity", () => {
    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    renderModal(baseRun({ updated_at: old }));
    expect(document.body.textContent).toContain("Reading can take several minutes per document.");

    rerender({
      run: baseRun({ updated_at: old }),
      readingProgress: { documents_total: 8, documents_finished: 2, documents_unusable: 0 },
      readingProgressObservedAt: Date.now(),
    });
    expect(document.body.textContent).not.toContain("Reading can take several minutes per document.");
    expect(document.querySelector('[data-testid="progress-last-update"]')?.textContent).toBe("Last update just now");
  });

  it("keeps reconnect messaging and the last known counts when polling fails", () => {
    renderModal(baseRun());
    rerender({
      pollState: "reconnecting",
      readingProgress: { documents_total: 8, documents_finished: 5, documents_unusable: 0 },
    });
    expect(document.body.textContent).toContain("We're having trouble reaching HiveForYou");
    expect(document.querySelector('[data-testid="progress-reading"]')?.textContent).toBe(
      "Finished reading 5 of 8 documents.",
    );
  });
});
