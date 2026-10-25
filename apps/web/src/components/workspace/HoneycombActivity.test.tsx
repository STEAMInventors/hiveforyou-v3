import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HONEYCOMB_COLORS,
  HoneycombActivity,
  honeycombFrame,
  LIVING_HIVE_MS,
} from "@/components/workspace/HoneycombActivity";

const argmax = (values: number[]) => values.indexOf(Math.max(...values));

describe("honeycombFrame (approved Living Hive motion)", () => {
  it("relay moves one light clockwise at 0.65 s per cell while reading", () => {
    expect(LIVING_HIVE_MS.relayLap / 4).toBe(650);
    const relay = { start: 0, lights: 1 as const };
    for (const [ms, cell] of [
      [0, 0],
      [650, 1],
      [1300, 2],
      [1950, 3],
      [2600, 0],
    ] as const) {
      const frame = honeycombFrame({ now: ms, effects: [], relay });
      expect(argmax(frame.lift)).toBe(cell);
      expect(frame.comets).toHaveLength(1);
    }
  });

  it("uses two opposite lights on the slower lap after reading", () => {
    const frame = honeycombFrame({ now: LIVING_HIVE_MS.relayLapAfterReading / 4, effects: [], relay: { start: 0, lights: 2 } });
    expect(frame.comets).toHaveLength(2);
    expect(frame.lift[1]).toBeCloseTo(frame.lift[3]!, 5);
    expect(frame.lift[1]!).toBeGreaterThan(frame.lift[0]!);
  });

  it("relay stays off until its start (during the sync pulse)", () => {
    const frame = honeycombFrame({ now: 100, effects: [], relay: { start: 500, lights: 2 } });
    expect(frame.comets).toHaveLength(0);
    expect(frame.lift).toEqual([0, 0, 0, 0]);
  });

  it("deposit blooms the arriving cell with a ring in its colour, then neighbours, then the opposite cell", () => {
    const d = LIVING_HIVE_MS.deposit;
    const effects = [{ type: "deposit" as const, cell: 1, start: 0, duration: d }];
    const early = honeycombFrame({ now: 0.22 * d, effects, relay: null });
    expect(argmax(early.lift)).toBe(1);
    expect(early.rings[1]?.color).toBe(HONEYCOMB_COLORS[1]);
    expect(early.rings.filter(Boolean)).toHaveLength(1);
    const mid = honeycombFrame({ now: 0.47 * d, effects, relay: null });
    expect(mid.lift[0]!).toBeGreaterThan(mid.lift[3]! - 1e-9);
    expect(mid.lift[2]!).toBeGreaterThan(0);
    const late = honeycombFrame({ now: 0.63 * d, effects, relay: null });
    expect(late.lift[3]!).toBeGreaterThan(0.45);
    expect(honeycombFrame({ now: d, effects, relay: null }).lift).toEqual([0, 0, 0, 0]);
  });

  it("swarm is one clockwise wave across all four cells", () => {
    const s = LIVING_HIVE_MS.swarm;
    const frame = honeycombFrame({ now: 0.5 * s, effects: [{ type: "swarm", cell: 0, start: 0, duration: s }], relay: null });
    expect(frame.rings.every((ring) => ring != null)).toBe(true);
    expect(frame.rings.map((ring) => ring!.color)).toEqual([...HONEYCOMB_COLORS]);
  });

  it("sync pulses all cells together and suppresses the relay", () => {
    const y = LIVING_HIVE_MS.sync;
    const frame = honeycombFrame({
      now: 0.2 * y,
      effects: [{ type: "sync", cell: 0, start: 0, duration: y }],
      relay: { start: 0, lights: 1 },
    });
    expect(new Set(frame.lift.map((v) => v.toFixed(6))).size).toBe(1);
    expect(frame.comets[0]?.opacity).toBe(0);
  });

  it("hold is one soft unified glow that ends still", () => {
    const h = LIVING_HIVE_MS.hold;
    const effects = [{ type: "hold" as const, cell: 0, start: 0, duration: h }];
    const peak = honeycombFrame({ now: 0.35 * h, effects, relay: null });
    expect(peak.lift[0]).toBeCloseTo(0.55, 5);
    expect(new Set(peak.lift).size).toBe(1);
    expect(honeycombFrame({ now: h, effects, relay: null }).lift).toEqual([0, 0, 0, 0]);
  });
});

describe("HoneycombActivity events", () => {
  let mount: HTMLDivElement;
  let root: Root;
  let rafQueue: Map<number, FrameRequestCallback>;
  let rafId: number;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    rafQueue = new Map();
    rafId = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafId += 1;
      rafQueue.set(rafId, cb);
      return rafId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      rafQueue.delete(id);
    });
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

  function render(props: Partial<ComponentProps<typeof HoneycombActivity>> = {}) {
    act(() => {
      root.render(<HoneycombActivity mode="processing" reducedMotion={false} {...props} />);
    });
  }

  const svg = () => document.querySelector('[data-testid="progress-honeycomb"]') as SVGElement;
  const effect = () => svg().getAttribute("data-effect");
  const advance = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });

  it("runs the relay loop only while processing", () => {
    render();
    expect(svg().getAttribute("data-active")).toBe("true");
    expect(svg().getAttribute("data-lights")).toBe("1");
    expect(rafQueue.size).toBe(1);
  });

  it("does not replay an arrival that already existed at mount (first load, reopen)", () => {
    render({ arrival: { seq: 4, kind: "single", finished: 6 } });
    expect(effect()).toBe("none");
  });

  it("plays one deposit for a single new document, then returns to the relay", () => {
    render({ arrival: null });
    render({ arrival: { seq: 1, kind: "single", finished: 2 } });
    expect(effect()).toBe("deposit");
    advance(LIVING_HIVE_MS.deposit);
    expect(effect()).toBe("none");
  });

  it("plays one swarm for a multi-document jump", () => {
    render({ arrival: null });
    render({ arrival: { seq: 1, kind: "batch", finished: 5 } });
    expect(effect()).toBe("swarm");
    advance(LIVING_HIVE_MS.swarm);
    expect(effect()).toBe("none");
  });

  it("ignores a re-delivered or older event sequence", () => {
    render({ arrival: null });
    render({ arrival: { seq: 2, kind: "single", finished: 3 } });
    advance(LIVING_HIVE_MS.deposit);
    render({ arrival: { seq: 2, kind: "single", finished: 3 } });
    expect(effect()).toBe("none");
    render({ arrival: { seq: 1, kind: "single", finished: 2 } });
    expect(effect()).toBe("none");
  });

  it("syncs once when reading completes while processing and switches to two lights; never on mount", () => {
    render({ readingDone: false });
    render({ readingDone: true });
    expect(effect()).toBe("sync");
    expect(svg().getAttribute("data-lights")).toBe("2");
    advance(LIVING_HIVE_MS.sync);
    expect(effect()).toBe("none");
    render({ readingDone: true });
    expect(effect()).toBe("none");

    act(() => {
      root.unmount();
    });
    root = createRoot(mount);
    render({ readingDone: true });
    expect(effect()).toBe("none");
    expect(svg().getAttribute("data-lights")).toBe("2");
  });

  it("holds once on success, then rests still with a check; no hold when opened already succeeded", () => {
    render();
    render({ mode: "success" });
    expect(effect()).toBe("hold");
    expect(document.querySelector('[data-testid="honeycomb-check"]')).toBeTruthy();
    expect(svg().getAttribute("data-active")).toBe("false");
    advance(LIVING_HIVE_MS.hold);
    expect(effect()).toBe("none");

    act(() => {
      root.unmount();
    });
    root = createRoot(mount);
    render({ mode: "success" });
    expect(effect()).toBe("none");
  });

  it("fades to quiet greys on failure over 700 ms, with no red", () => {
    render();
    render({ mode: "failed" });
    expect(effect()).toBe("rest");
    const cells = [...document.querySelectorAll('[data-testid="honeycomb-cell"]')];
    expect(cells.map((c) => c.getAttribute("fill"))).toEqual(["#D3D7DD", "#C9CED6", "#DADEE3", "#C2C8D0"]);
    expect((cells[0] as SVGElement).style.transition).toContain(`${LIVING_HIVE_MS.rest}ms`);
    advance(LIVING_HIVE_MS.rest);
    expect(effect()).toBe("none");
  });

  it("stops event motion when the run ends mid-animation and ignores later arrivals", () => {
    render({ arrival: null });
    render({ arrival: { seq: 1, kind: "single", finished: 1 } });
    render({ mode: "still", arrival: { seq: 1, kind: "single", finished: 1 } });
    expect(effect()).toBe("none");
    expect(svg().getAttribute("data-active")).toBe("false");
    render({ mode: "still", arrival: { seq: 2, kind: "single", finished: 2 } });
    expect(effect()).toBe("none");
  });

  it("is completely still under reduced motion while counts keep arriving", () => {
    render({ reducedMotion: true, arrival: null });
    expect(svg().getAttribute("data-motion")).toBe("still");
    expect(rafQueue.size).toBe(0);
    render({ reducedMotion: true, arrival: { seq: 1, kind: "batch", finished: 3 } });
    render({ reducedMotion: true, arrival: { seq: 1, kind: "batch", finished: 3 }, readingDone: true });
    render({ reducedMotion: true, mode: "success" });
    expect(effect()).toBe("none");
    expect(rafQueue.size).toBe(0);
    expect((document.querySelector('[data-testid="honeycomb-cell"]') as SVGElement).style.transition).toBe("none");
  });

  it("stops the relay as soon as reduced motion turns on", () => {
    render();
    expect(rafQueue.size).toBe(1);
    render({ reducedMotion: true });
    expect(rafQueue.size).toBe(0);
  });

  it("cancels its frame and timers on unmount mid-animation", () => {
    render({ arrival: null });
    render({ arrival: { seq: 1, kind: "single", finished: 1 } });
    act(() => {
      root.unmount();
    });
    expect(rafQueue.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    root = createRoot(mount);
  });

  it("keeps the brand geometry and colours, and stays decorative", () => {
    render();
    const cells = [...document.querySelectorAll('[data-testid="honeycomb-cell"]')];
    expect(cells.map((c) => c.getAttribute("fill"))).toEqual([...HONEYCOMB_COLORS]);
    expect(svg().getAttribute("aria-hidden")).toBe("true");
    expect(svg().getAttribute("focusable")).toBe("false");
  });
});
