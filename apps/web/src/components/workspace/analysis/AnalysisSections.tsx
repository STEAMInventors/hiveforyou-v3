"use client";

import { useId, useState } from "react";

import { AnalysisFactRow, StatusDot } from "@/components/workspace/analysis/AnalysisFactRow";
import type {
  AnalysisDocument,
  AnalysisNotFound,
  AnalysisSummary,
  AnalysisTopic,
} from "@/lib/study-runs/analysis-view";

const CARD = "flex flex-col rounded-2xl border border-[#E7E9ED] bg-white px-[18px] py-5 md:rounded-[20px] md:px-[30px] md:py-7";
const NOT_FOUND_PREVIEW = 12;

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function AnalysisTopicSection({ topic }: { topic: AnalysisTopic }) {
  return (
    <section
      id={topic.id}
      aria-labelledby={`${topic.id}-title`}
      className={`${CARD} gap-[18px] scroll-mt-4`}
      data-testid="analysis-topic"
    >
      <h3
        id={`${topic.id}-title`}
        tabIndex={-1}
        className="m-0 font-brand text-[22px] font-semibold tracking-[-0.015em] text-[#1F2328] outline-none md:text-2xl"
      >
        {topic.label}
      </h3>
      {topic.groups.map((group) => (
        <div key={group.source_document_id} className="flex flex-col">
          <h4 className="m-0 pb-1 text-sm font-semibold text-[#4A525C] [overflow-wrap:anywhere]">
            {group.document_label}
            <span className="font-normal text-[#6B7280]"> · {group.filename}</span>
          </h4>
          {group.facts.map((fact) => (
            <AnalysisFactRow
              key={fact.key}
              fact={fact}
              source={[fact.document_label, fact.page_label].filter(Boolean).join(" · ")}
            />
          ))}
        </div>
      ))}
    </section>
  );
}

function documentFlags(doc: AnalysisDocument): string[] {
  if (doc.read_state === "failed") return ["Couldn't be read"];
  const flags: string[] = [];
  if (doc.read_state === "unrecognized") flags.push("Not a recognized document type");
  if (doc.uncertain_count > 0) flags.push(`${doc.uncertain_count} uncertain`);
  if (doc.set_aside_count > 0) flags.push("Some items set aside");
  return flags;
}

function DocumentCard({ doc }: { doc: AnalysisDocument }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const flags = documentFlags(doc);
  const expandable = doc.facts.length > 0 || doc.not_stated.length > 0;
  return (
    <div
      className="overflow-hidden rounded-2xl border border-[#E7E9ED] bg-white"
      data-testid="analysis-document"
      data-read-state={doc.read_state}
    >
      <button
        type="button"
        aria-expanded={expandable ? open : undefined}
        aria-controls={expandable && open ? panelId : undefined}
        disabled={!expandable}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-[44px] w-full items-center gap-3.5 border-0 bg-transparent px-[18px] py-4 text-left enabled:hover:bg-[#FAFBFC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B7CF6]"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-base font-semibold text-[#1F2328]">{doc.document_label}</span>
          <span className="truncate text-[13px] text-[#6B7280]">
            {doc.filename} · {doc.pages}
          </span>
          {flags.length > 0 ? (
            <span className="flex flex-wrap gap-1.5 pt-1">
              {flags.map((flag) => (
                <span
                  key={flag}
                  className="inline-flex h-6 items-center whitespace-nowrap rounded-full bg-[#FEF5E1] px-2.5 text-xs font-semibold text-[#875700]"
                >
                  {flag}
                </span>
              ))}
            </span>
          ) : null}
        </span>
        <span className="hidden whitespace-nowrap text-[13px] font-medium text-[#6B7280] md:inline">
          {plural(doc.facts.length, "item", "items")}
        </span>
        {expandable ? (
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
            className={`flex-none motion-safe:transition-transform ${open ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        ) : null}
      </button>
      {expandable && open ? (
        <div id={panelId} className="flex flex-col border-t border-[#EEF0F3] px-[18px] pb-4 pt-1">
          {doc.facts.map((fact) => (
            <AnalysisFactRow
              key={fact.key}
              fact={fact}
              source={[fact.page_label, fact.record_label].filter(Boolean).join(" · ")}
            />
          ))}
          {doc.not_stated.length > 0 ? (
            <p className="m-0 pt-3 text-[13.5px] leading-normal text-[#6B7280]" data-testid="document-not-stated">
              <strong className="font-semibold text-[#4A525C]">Not stated:</strong>{" "}
              {doc.not_stated.join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AnalysisDocumentList({ documents }: { documents: AnalysisDocument[] }) {
  return (
    <section aria-label="Results by document" className="flex flex-col gap-2.5" data-testid="analysis-documents">
      {documents.map((doc) => (
        <DocumentCard key={doc.source_document_id} doc={doc} />
      ))}
    </section>
  );
}

export function AnalysisNotFoundSection({
  notFound,
  summary,
}: {
  notFound: AnalysisNotFound[];
  summary: AnalysisSummary;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? notFound : notFound.slice(0, NOT_FOUND_PREVIEW);
  return (
    <section
      id="analysis-not-found"
      aria-labelledby="analysis-not-found-title"
      className="flex scroll-mt-4 flex-col gap-4 rounded-2xl border-[1.5px] border-dashed border-[#C9CFD8] bg-white px-[18px] py-5 md:rounded-[20px] md:px-[30px] md:py-7"
      data-testid="analysis-not-found"
    >
      <div className="flex flex-col gap-1.5">
        <h3
          id="analysis-not-found-title"
          tabIndex={-1}
          className="m-0 font-brand text-[22px] font-semibold tracking-[-0.015em] text-[#1F2328] outline-none md:text-2xl"
        >
          What the reading didn&apos;t find
        </h3>
        <p className="m-0 text-[15.5px] leading-relaxed text-[#4A525C]">
          {notFound.length > 0
            ? "The reading looked for these and didn't find them stated on the pages it read. That doesn't mean something is wrong; they may be worth asking about."
            : "Nothing was reported as not found on the pages that were read."}
        </p>
      </div>
      {visible.length > 0 ? (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-3 p-0">
          {visible.map((entry) => (
            <li key={entry.key} className="flex items-start gap-3 rounded-xl bg-[#F7F8FA] px-4 py-3.5" data-testid="not-found-item">
              <StatusDot status="NOT_FOUND" />
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-semibold leading-snug text-[#1F2328]">
                  {entry.record_label} · {entry.field_label}
                </span>
                <span className="text-[13.5px] leading-snug text-[#6B7280] [overflow-wrap:anywhere]">
                  Not stated in: {entry.documents.join(", ")}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {notFound.length > NOT_FOUND_PREVIEW ? (
        <button
          type="button"
          aria-expanded={showAll}
          onClick={() => setShowAll((value) => !value)}
          className="min-h-[44px] self-start border-0 bg-transparent p-0 text-sm font-semibold text-[#2F6FE4] hover:underline"
        >
          {showAll ? "Show fewer" : `Show all ${notFound.length}`}
        </button>
      ) : null}
      <div className="flex flex-col gap-2.5 border-t border-[#EEF0F3] pt-4">
        <h4 className="m-0 text-[15px] font-semibold text-[#1F2328]">How cleanly we could read things</h4>
        <p className="m-0 flex items-start gap-3 text-[15px] leading-relaxed text-[#2E343B]" data-testid="uncertain-note">
          <StatusDot status="UNCERTAIN" />
          <span>
            {summary.uncertain > 0 ? (
              <>
                <strong className="font-semibold">
                  {plural(summary.uncertain, "item is", "items are")} marked Uncertain.
                </strong>{" "}
                {summary.uncertain === 1
                  ? "The reading flagged it as unclear or only partly stated. It's labelled where it appears."
                  : "The reading flagged them as unclear or only partly stated. They're labelled where they appear."}
              </>
            ) : (
              "No items are marked Uncertain."
            )}
          </span>
        </p>
        {summary.set_aside > 0 ? (
          <p className="m-0 flex items-start gap-3 text-[15px] leading-relaxed text-[#2E343B]" data-testid="set-aside-note">
            <span aria-hidden="true" className="mt-1.5 h-2.5 w-2.5 flex-none rounded-full bg-[#C3C9D1]" />
            <span>
              <strong className="font-semibold">
                {plural(summary.set_aside, "candidate item was", "candidate items were")} set aside
              </strong>{" "}
              because {summary.set_aside_reasons.join("; or ") || "it didn't pass a check"}. They
              aren&apos;t shown here.
            </span>
          </p>
        ) : null}
        {summary.documents_not_read.length > 0 ? (
          <p className="m-0 flex items-start gap-3 text-[15px] leading-relaxed text-[#2E343B]" data-testid="not-read-note">
            <span aria-hidden="true" className="mt-1.5 h-2.5 w-2.5 flex-none rounded-full bg-[#C3C9D1]" />
            <span>
              <strong className="font-semibold">
                {plural(summary.documents_not_read.length, "document", "documents")} couldn&apos;t be read:
              </strong>{" "}
              {summary.documents_not_read.join(", ")}.
            </span>
          </p>
        ) : null}
      </div>
    </section>
  );
}
