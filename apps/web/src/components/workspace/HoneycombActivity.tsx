import type { CSSProperties } from "react";

/** Same geometry as `public/brand/hiveforyou-motion.svg`, inlined so CSS can loop it while active. */
const HEX = "0.00,-17.60 15.24,-8.80 15.24,8.80 0.00,17.60 -15.24,8.80 -15.24,-8.80";

const CELLS = [
  { x: 120.0, y: 50.0, color: "#3B7CF6", sx: -70, sy: -28, sr: -48, delay: 0.1, breathe: 1.0 },
  { x: 137.3, y: 80.0, color: "#EF5143", sx: 78, sy: -30, sr: 62, delay: 0.16, breathe: 1.3 },
  { x: 120.0, y: 110.0, color: "#F6B826", sx: 70, sy: 10, sr: -35, delay: 0.22, breathe: 1.6 },
  { x: 102.7, y: 80.0, color: "#2FA35A", sx: -82, sy: 34, sr: 40, delay: 0.28, breathe: 1.9 },
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

/** Assembles once on mount; cells breathe only while `active` (a nonterminal, running study run). */
export function HoneycombActivity({ active, className }: { active: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 240 160"
      aria-hidden
      focusable="false"
      className={`hfy-mark--assemble${active ? " hfy-mark--active" : ""}${className ? ` ${className}` : ""}`}
      data-testid="progress-honeycomb"
      data-active={active ? "true" : "false"}
    >
      {NOISE.map((n) => (
        <g key={n.t} transform={n.t}>
          <g className="hfy-noise" fill={n.fill} opacity={n.opacity}>
            {n.shape}
          </g>
        </g>
      ))}
      {CELLS.map((c) => (
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
      ))}
    </svg>
  );
}
