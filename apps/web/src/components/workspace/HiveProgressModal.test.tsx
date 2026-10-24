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

  it("uses static brand mark while queued and motion asset while running", () => {
    renderModal(baseRun({ status: "QUEUED", stage: "enqueue" }));
    let images = document.querySelectorAll('[data-testid="brand-image"]');
    expect(images.length).toBe(1);

    act(() => {
      root.render(
        <HiveProgressModal
          open
          run={baseRun({ status: "RUNNING", stage: "extract" })}
          documentCount={3}
          pollState="ok"
          lastPollSuccessAt={Date.now()}
          returnFocusRef={{ current: returnFocus }}
          onMinimize={vi.fn()}
          onViewResults={vi.fn()}
        />,
      );
    });

    images = document.querySelectorAll('[data-testid="brand-image"]');
    expect(images.length).toBe(1);
    const pulse = document.querySelector(".animate-pulse");
    expect(pulse).toBeTruthy();
  });
});
