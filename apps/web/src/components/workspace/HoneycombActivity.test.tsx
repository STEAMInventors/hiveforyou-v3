import { readFileSync } from "node:fs";
import path from "node:path";

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HONEYCOMB_EFFECT_MS, HoneycombActivity } from "@/components/workspace/HoneycombActivity";

describe("HoneycombActivity living hive events", () => {
  let mount: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    mount = document.createElement("div");
    document.body.append(mount);
    root = createRoot(mount);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  function render(props: Partial<ComponentProps<typeof HoneycombActivity>> = {}) {
    act(() => {
      root.render(<HoneycombActivity active {...props} />);
    });
  }

  const svg = () => document.querySelector('[data-testid="progress-honeycomb"]') as SVGElement;
  const effect = () => svg().getAttribute("data-effect");
  const echoes = () => document.querySelectorAll('[data-testid="honeycomb-echo"]');
  const advance = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });

  it("does not replay an arrival that already existed at mount (first load, reopen)", () => {
    render({ arrival: { seq: 4, kind: "single", finished: 6 } });
    expect(effect()).toBe("none");
    expect(echoes().length).toBe(0);
  });

  it("plays one snap with a single same-colour echo for a new document, then cleans up", () => {
    render({ arrival: null });
    render({ arrival: { seq: 1, kind: "single", finished: 2 } });
    expect(effect()).toBe("single");
    expect(echoes().length).toBe(1);
    expect(echoes()[0]?.getAttribute("fill")).toBe("#EF5143");
    expect(document.querySelectorAll(".hfy-cell-snap").length).toBe(1);
    expect(document.querySelectorAll(".hfy-cell-nudge").length).toBe(3);

    advance(HONEYCOMB_EFFECT_MS.single + 100);
    expect(effect()).toBe("none");
    expect(echoes().length).toBe(0);
    expect(document.querySelectorAll(".hfy-cell-snap, .hfy-cell-nudge").length).toBe(0);
  });

  it("aggregates a multi-document jump into one combined pulse", () => {
    render({ arrival: null });
    render({ arrival: { seq: 1, kind: "batch", finished: 5 } });
    expect(effect()).toBe("batch");
    expect(document.querySelectorAll(".hfy-cell-snap--batch").length).toBe(4);
    expect(document.querySelectorAll(".hfy-cell-echo--batch").length).toBe(4);
    advance(HONEYCOMB_EFFECT_MS.batch + 100);
    expect(effect()).toBe("none");
  });

  it("ignores a re-delivered or older event sequence", () => {
    render({ arrival: null });
    render({ arrival: { seq: 2, kind: "single", finished: 3 } });
    advance(HONEYCOMB_EFFECT_MS.single + 100);
    render({ arrival: { seq: 2, kind: "single", finished: 3 } });
    expect(effect()).toBe("none");
    render({ arrival: { seq: 1, kind: "single", finished: 2 } });
    expect(effect()).toBe("none");
  });

  it("a newer event during playback replaces the current one without queuing", () => {
    render({ arrival: null });
    render({ arrival: { seq: 1, kind: "single", finished: 1 } });
    advance(400);
    render({ arrival: { seq: 2, kind: "batch", finished: 3 } });
    expect(effect()).toBe("batch");
    advance(HONEYCOMB_EFFECT_MS.batch + 100);
    expect(effect()).toBe("none");
  });

  it("seals once when reading completes while active, never on mount or repeat", () => {
    render({ readingDone: false });
    render({ readingDone: true });
    expect(effect()).toBe("seal");
    expect(document.querySelectorAll(".hfy-cell-seal").length).toBe(4);
    advance(HONEYCOMB_EFFECT_MS.seal + 100);
    expect(effect()).toBe("none");
    render({ readingDone: true });
    expect(effect()).toBe("none");

    act(() => {
      root.unmount();
    });
    root = createRoot(mount);
    render({ readingDone: true });
    expect(effect()).toBe("none");
  });

  it("stops all motion immediately when the run ends mid-animation, with no flourish", () => {
    render({ arrival: null, readingDone: false });
    render({ arrival: { seq: 1, kind: "single", finished: 1 }, readingDone: false });
    expect(effect()).toBe("single");

    render({ active: false, arrival: { seq: 1, kind: "single", finished: 1 }, readingDone: true });
    expect(effect()).toBe("none");
    expect(svg().getAttribute("class")).not.toContain("hfy-mark--active");
    expect(echoes().length).toBe(0);

    render({ active: false, arrival: { seq: 2, kind: "single", finished: 2 }, readingDone: true });
    expect(effect()).toBe("none");
  });

  it("clears its timer on unmount mid-animation", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render({ arrival: null });
    render({ arrival: { seq: 1, kind: "single", finished: 1 } });
    act(() => {
      root.unmount();
    });
    expect(vi.getTimerCount()).toBe(0);
    root = createRoot(mount);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("stays decorative for assistive technology", () => {
    render({ arrival: null });
    render({ arrival: { seq: 1, kind: "single", finished: 1 } });
    expect(svg().getAttribute("aria-hidden")).toBe("true");
    expect(svg().getAttribute("focusable")).toBe("false");
  });

  it("disables every event animation and hides echoes under reduced motion", () => {
    const css = readFileSync(path.resolve(__dirname, "../../styles/hiveforyou.css"), "utf8");
    const reduced = css.match(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.hfy-cell-snap, \.hfy-cell-nudge, \.hfy-cell-seal \{ animation: none; \}\s*\.hfy-cell-echo \{ display: none; \}/,
    );
    expect(reduced).not.toBeNull();
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.hfy-mark--active \.hfy-cell-fill \{ animation: none; \} \}/);
  });
});
