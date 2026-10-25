import { type CSSProperties, useEffect, useRef, useState } from "react";

/** Same geometry as `public/brand/hiveforyou-motion.svg`, inlined so CSS can loop it while active. */
const HEX = "0.00,-17.60 15.24,-8.80 15.24,8.80 0.00,17.60 -15.24,8.80 -15.24,-8.80";

/** Clockwise from top; `ix`/`iy` point toward the centre of the mark for the reading-complete seal. */
const CELLS = [
  { x: 120.0, y: 50.0, color: "#3B7CF6", sx: -70, sy: -28, sr: -48, delay: 0.1, breathe: 1.0, ix: 0, iy: 1.5 },
  { x: 137.3, y: 80.0, color: "#EF5143", sx: 78, sy: -30, sr: 62, delay: 0.16, breathe: 1.3, ix: -1.5, iy: 0 },
  { x: 120.0, y: 110.0, color: "#F6B826", sx: 70, sy: 10, sr: -35, delay: 0.22, breathe: 1.6, ix: 0, iy: -1.5 },
  { x: 102.7, y: 80.0, color: "#2FA35A", sx: -82, sy: 34, sr: 40, delay: 0.28, breathe: 1.9, ix: 1.5, iy: 0 },
] as const;

const NOISE = [
  { t: "translate(142.1 110.0) rotate(35)", fill: "#C9CED6", opacity: 1, shape: <polygon points="0,-16.5 14.9,11.6 -14.9,11.6" /> },
  { t: "translate(163.2 132.4) rotate(-57)", fill: "#AEB5BF", opacity: 1, shape: <rect x="-6.4" y="-6.4" width="12.7" height="12.7" rx="2" /> },
  { t: "translate(199.8 98.5) rotate(48)", fill: "#DADEE3", opacity: 1, shape: <rect x="-9.9" y="-3" width="19.8" height="6" rx="3" /> },
  { t: "translate(114.4 48.6) rotate(5)", fill: "#3B7CF6", opacity: 0.55, shape: <polygon points="0.0,-13.6 12.9,-4.2 8.0,11.0 -8.0,11.0 -12.9,-4.2" /> },
  { t: "translate(32.4 44.9) rotate(-26)", fill: "#EF5143", opacity: 0.55, shape: <polygon points="0,-16.3 14.7,11.4 -14.7,11.4" /> },
  { t: "translate(167.8 37.8) rotate(36)", fill: "#F6B826", opacity: 0.55, shape: <rect x="-5.1" y="-5.1" width="10.1" height="10.1" rx="2" /> },
  { t: "translate(141.1 33.7) rotate(-60)", fill: "#2FA35A", opacity: 0.55, shape: <rect x="-16.0" y="-3" width="31.9" height="6" rx="3" /> },
  { t: "translate(67.7 44.7) rotate(58)", fill: "#C9CED6", opacity: 1, shape: <polygon points="0,-16.0 14.4,11.2 -14.4,11.2" /> },
  { t: "translate(82.1 137.2) rotate(5)", fill: "#AEB5BF", opacity: 1, shape: <polygon points="0.0,-14.4 13.7,-4.5 8.5,11.7 -8.5,11.7 -13.7,-4.5" /> },
  { t: "translate(66.9 134.7) rotate(23)", fill: "#DADEE3", opacity: 1, shape: <rect x="-8.4" y="-8.4" width="16.7" height="16.7" rx="2" /> },
];

/** Must match the keyframe timings in `hiveforyou.css`; the effect layer is removed after this. */
export const HONEYCOMB_EFFECT_MS = { single: 900, batch: 950, seal: 700 } as const;

type EffectKind = keyof typeof HONEYCOMB_EFFECT_MS;
type Effect = { kind: EffectKind; id: number; cell: number };

export type HoneycombArrival = { seq: number; kind: "single" | "batch"; finished: number };

type CellMotion = { className: string | null; delayMs: number; echo: boolean };

function cellMotion(effect: Effect | null, index: number): CellMotion {
  if (!effect) {
    return { className: null, delayMs: 0, echo: false };
  }
  if (effect.kind === "seal") {
    return { className: "hfy-cell-seal", delayMs: 0, echo: false };
  }
  if (effect.kind === "batch") {
    return { className: "hfy-cell-snap hfy-cell-snap--batch", delayMs: index * 70, echo: true };
  }
  if (index === effect.cell) {
    return { className: "hfy-cell-snap", delayMs: 0, echo: true };
  }
  const clockwiseDistance = (index - effect.cell + CELLS.length) % CELLS.length;
  return { className: "hfy-cell-nudge", delayMs: 200 + (clockwiseDistance - 1) * 60, echo: false };
}

/**
 * Assembles once on mount; cells breathe only while `active` (a nonterminal, running study run).
 * `arrival` events newer than the one present at mount play once; `readingDone` turning true while
 * active plays the seal. Nothing replays on remount, and everything stops when `active` turns false.
 */
export function HoneycombActivity({
  active,
  arrival = null,
  readingDone = false,
  className,
}: {
  active: boolean;
  arrival?: HoneycombArrival | null;
  readingDone?: boolean;
  className?: string;
}) {
  const seenSeqRef = useRef(arrival?.seq ?? 0);
  const readingDoneRef = useRef(readingDone);
  const sealIdRef = useRef(0);
  const [effect, setEffect] = useState<Effect | null>(null);

  const arrivalSeq = arrival?.seq ?? 0;
  const arrivalKind = arrival?.kind ?? "single";
  const arrivalFinished = arrival?.finished ?? 0;

  useEffect(() => {
    if (arrivalSeq <= seenSeqRef.current) {
      return;
    }
    seenSeqRef.current = arrivalSeq;
    if (!active) {
      return;
    }
    const cell = (((arrivalFinished - 1) % CELLS.length) + CELLS.length) % CELLS.length;
    setEffect({ kind: arrivalKind, id: arrivalSeq, cell });
  }, [active, arrivalFinished, arrivalKind, arrivalSeq]);

  useEffect(() => {
    const crossed = readingDone && !readingDoneRef.current;
    readingDoneRef.current = readingDone;
    if (crossed && active) {
      sealIdRef.current -= 1;
      setEffect({ kind: "seal", id: sealIdRef.current, cell: 0 });
    }
  }, [active, readingDone]);

  useEffect(() => {
    if (!active) {
      setEffect(null);
    }
  }, [active]);

  useEffect(() => {
    if (!effect) {
      return;
    }
    const timer = window.setTimeout(() => setEffect(null), HONEYCOMB_EFFECT_MS[effect.kind] + 100);
    return () => window.clearTimeout(timer);
  }, [effect]);

  return (
    <svg
      viewBox="0 0 240 160"
      aria-hidden
      focusable="false"
      className={`hfy-mark--assemble${active ? " hfy-mark--active" : ""}${className ? ` ${className}` : ""}`}
      data-testid="progress-honeycomb"
      data-active={active ? "true" : "false"}
      data-effect={effect?.kind ?? "none"}
    >
      {NOISE.map((n) => (
        <g key={n.t} transform={n.t}>
          <g className="hfy-noise" fill={n.fill} opacity={n.opacity}>
            {n.shape}
          </g>
        </g>
      ))}
      {CELLS.map((c, index) => {
        const motion = cellMotion(effect, index);
        return (
          <g key={c.color} transform={`translate(${c.x} ${c.y})`}>
            <g
              className="hfy-cell"
              style={
                {
                  "--sx": `${c.sx}px`,
                  "--sy": `${c.sy}px`,
                  "--sr": `${c.sr}deg`,
                  animationDelay: `${c.delay}s`,
                } as CSSProperties
              }
            >
              {motion.echo && effect ? (
                <polygon
                  key={`echo-${effect.id}`}
                  className={`hfy-cell-echo${effect.kind === "batch" ? " hfy-cell-echo--batch" : ""}`}
                  points={HEX}
                  fill={c.color}
                  data-testid="honeycomb-echo"
                />
              ) : null}
              <g
                className={motion.className ?? undefined}
                style={
                  motion.className
                    ? ({
                        "--ix": `${c.ix}px`,
                        "--iy": `${c.iy}px`,
                        animationDelay: `${motion.delayMs}ms`,
                      } as CSSProperties)
                    : undefined
                }
              >
                <polygon
                  className="hfy-cell-fill"
                  points={HEX}
                  fill={c.color}
                  stroke={c.color}
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  style={{ animationDelay: `${c.breathe}s` }}
                />
              </g>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
