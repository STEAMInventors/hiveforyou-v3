"use client";

import { useId, useState } from "react";

import type { AnalysisFact } from "@/lib/study-runs/analysis-view";

export const STATUS_LABEL: Record<AnalysisFact["status"], string> = {
  OBSERVED: "Observed",
  UNCERTAIN: "Uncertain",
};

export function StatusDot({ status }: { status: AnalysisFact["status"] | "NOT_FOUND" }) {
  if (status === "NOT_FOUND") {
    return (
      <span
        aria-hidden="true"
        className="mt-1.5 h-2.5 w-2.5 flex-none rounded-[2px] border-[1.5px] border-dashed border-[#9AA3AE]"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={
        status === "UNCERTAIN"
          ? "mt-1.5 h-2.5 w-2.5 flex-none rounded-full border-2 border-[#E0A21A] bg-white"
          : "mt-1.5 h-2.5 w-2.5 flex-none rounded-full bg-[#2FA35A]"
      }
    />
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#9AA3AE"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`mt-0.5 flex-none motion-safe:transition-transform ${open ? "rotate-180" : ""}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

/** One candidate fact; expands to the exact words it was read from. */
export function AnalysisFactRow({
  fact,
  source,
}: {
  fact: AnalysisFact;
  /** Secondary line, e.g. "Annual goal · p. 2" in the document view. */
  source: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const status = STATUS_LABEL[fact.status];
  return (
    <div className="border-b border-[#F0F2F5]" data-testid="analysis-fact" data-status={fact.status}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-[44px] w-full items-start gap-3 border-0 bg-transparent py-3.5 text-left hover:bg-[#FAFBFC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B7CF6]"
      >
        <StatusDot status={fact.status} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[15.5px] font-medium leading-normal text-[#1F2328]">
            {fact.field_label}
            {fact.value_text ? `: ${fact.value_text}` : ""}
          </span>
          <span className="flex flex-wrap gap-x-2.5 gap-y-1 text-[13px] font-medium text-[#6B7280]">
            <span>{source}</span>
            {fact.status === "UNCERTAIN" ? (
              <span className="font-semibold text-[#875700]">Uncertain</span>
            ) : (
              <span className="sr-only">Observed</span>
            )}
          </span>
        </span>
        <Chevron open={open} />
      </button>
      {open ? (
        <div
          id={panelId}
          className="mb-3.5 ml-0 flex flex-col gap-2 rounded-xl bg-[#FFFAEB] px-4 py-3.5 shadow-[inset_3px_0_0_#F6B826] md:ml-[22px]"
          data-testid="analysis-quote"
        >
          {fact.evidence.map((anchor, index) => (
            <div key={index} className="flex flex-col gap-1">
              <span className="text-[15px] font-medium leading-relaxed text-[#1F2328] [overflow-wrap:anywhere]">
                “{anchor.exact_quote}”
              </span>
              <span className="text-[12.5px] font-medium text-[#6B7280] [overflow-wrap:anywhere]">
                {status} · {fact.filename} · page {anchor.page_number}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
