"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AnalysisDocumentList,
  AnalysisNotFoundSection,
  AnalysisTopicSection,
} from "@/components/workspace/analysis/AnalysisSections";
import { StatusDot } from "@/components/workspace/analysis/AnalysisFactRow";
import { getDomainPackDisplayLabels } from "@/lib/domain-packs/public-metadata";
import {
  buildAnalysisView,
  type AnalysisView,
  type LabelLookup,
} from "@/lib/study-runs/analysis-view";
import { fetchStudyRunExtraction, StudyRunApiError } from "@/lib/study-runs/client";

type ViewMode = "topic" | "document";

const NOT_FOUND_TARGET = "analysis-not-found";

export type AnalysisQuestions = { heading: string; items: string[] };

function heroHeading(view: AnalysisView): string {
  const { documents_total: total, documents_read: read } = view.summary;
  if (!view.has_pack_extraction) return "We've read your documents";
  if (read === total) return total === 1 ? "We've read your document" : `We've read your ${total} documents`;
  return `We've read ${read} of your ${total} documents`;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function ViewSwitch({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <div role="group" aria-label="Show results" className="flex rounded-[11px] bg-[#EDEFF2] p-[3px]">
      {(
        [
          ["topic", "By topic"],
          ["document", "By document"],
        ] as const
      ).map(([key, label]) => {
        const on = mode === key;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(key)}
            className={`h-11 flex-1 rounded-lg border-0 text-[13.5px] font-semibold lg:h-9 ${
              on ? "bg-white text-[#1F2328] shadow-[0_1px_3px_rgba(31,35,40,0.12)]" : "bg-transparent text-[#6B7280]"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function CanonicalStudyNextCard() {
  return (
    <section
      aria-labelledby="analysis-next-title"
      className="flex flex-col gap-1.5 rounded-2xl bg-[#1F2328] px-[18px] py-6 text-white md:rounded-[20px] md:px-[30px] md:py-7"
      data-testid="canonical-study-next"
    >
      <h3 id="analysis-next-title" className="m-0 font-brand text-[22px] font-semibold text-white">
        Next: Your Canonical Study
      </h3>
      <p className="m-0 text-[15px] leading-relaxed text-[#C9CED6]">
        Building your Canonical Study isn&apos;t available yet. When it is, Hive will check these items
        against each other and connect them across documents, and every finding will keep its source.
      </p>
    </section>
  );
}

function QuestionsBox({ questions }: { questions: AnalysisQuestions }) {
  if (questions.items.length === 0) return null;
  return (
    <div className="flex flex-col gap-3 rounded-[18px] bg-[#F7F8FA] px-6 py-[22px]" data-testid="analysis-questions">
      <p className="m-0 text-[13px] font-semibold text-[#6B7280]">{questions.heading}</p>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {questions.items.map((item, index) => (
          <li key={`${index}-${item}`} className="flex items-start gap-3 border-t border-[#E7E9ED] pt-3">
            <span aria-hidden="true" className="min-w-4 font-brand text-[15px] font-semibold text-[#2F6FE4]">
              {index + 1}
            </span>
            <span className="text-base font-medium leading-snug text-[#1F2328]">{item}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SummaryStrip({ view }: { view: AnalysisView }) {
  const s = view.summary;
  const cells: [string, string][] = [
    ["Documents read", s.documents_read === s.documents_total ? String(s.documents_total) : `${s.documents_read} of ${s.documents_total}`],
    ["Pages read", String(s.pages_read)],
    ["Items found", String(s.items)],
    ["Uncertain", String(s.uncertain)],
    ["Not found", String(s.not_found)],
    ["Set aside", String(s.set_aside)],
  ];
  return (
    <dl
      className="m-0 grid grid-cols-2 gap-px overflow-hidden rounded-[18px] border border-[#E7E9ED] bg-[#E7E9ED] sm:grid-cols-3 xl:grid-cols-6"
      data-testid="analysis-summary"
    >
      {cells.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-1 bg-white px-[18px] py-4">
          <dt className="text-[12.5px] font-semibold text-[#6B7280]">{label}</dt>
          <dd className="m-0 text-[15.5px] font-semibold text-[#1F2328]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Legend() {
  return (
    <div className="flex flex-col gap-2 text-sm leading-normal text-[#4A525C]" data-testid="analysis-legend">
      <ul className="m-0 flex list-none flex-wrap items-start gap-x-6 gap-y-3 p-0">
        <li className="flex items-start gap-2">
          <StatusDot status="OBSERVED" />
          <span>
            <strong className="font-semibold text-[#1F2328]">Observed</strong> the reading quoted these words from the
            page
          </span>
        </li>
        <li className="flex items-start gap-2">
          <StatusDot status="UNCERTAIN" />
          <span>
            <strong className="font-semibold text-[#1F2328]">Uncertain</strong> the reading marked this as unclear or
            only partly stated
          </span>
        </li>
        <li className="flex items-start gap-2">
          <StatusDot status="NOT_FOUND" />
          <span>
            <strong className="font-semibold text-[#1F2328]">Not found</strong> the reading didn&apos;t find this stated
            on the pages it read
          </span>
        </li>
      </ul>
      <p className="m-0 text-[13.5px] text-[#6B7280]">None of these are verified findings yet.</p>
    </div>
  );
}

export function AnalysisCompleteView({
  view,
  questions,
  onGoToDocuments,
}: {
  view: AnalysisView;
  questions: AnalysisQuestions;
  onGoToDocuments: () => void;
}) {
  const [mode, setMode] = useState<ViewMode>("topic");
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!target || mode !== "topic") return;
    const section = document.getElementById(target);
    section?.scrollIntoView?.({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    document.getElementById(`${target}-title`)?.focus({ preventScroll: true });
    setTarget(null);
  }, [mode, target]);

  const goTo = (id: string) => {
    setMode("topic");
    setTarget(id);
  };

  const navItems: { id: string; label: string; count: number }[] = [
    ...view.topics.map((topic) => ({ id: topic.id, label: topic.label, count: topic.count })),
    { id: NOT_FOUND_TARGET, label: "Not found", count: view.not_found.length },
  ];

  return (
    <div className="flex flex-col gap-7 pb-6" data-testid="analysis-complete">
      <button
        type="button"
        onClick={onGoToDocuments}
        className="inline-flex min-h-[44px] items-center gap-1.5 self-start md:min-h-8 border-0 bg-transparent p-0 text-[14.5px] font-semibold text-[#4A525C] hover:underline"
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        Back to Documents
      </button>

      <section
        aria-labelledby="analysis-hero-title"
        className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] gap-9 rounded-[18px] border border-[#E7E9ED] bg-white px-5 py-6 md:rounded-3xl md:px-10 md:py-9"
      >
        <div className="flex flex-col gap-4">
          <span className="inline-flex h-[30px] items-center gap-2 self-start rounded-full bg-[#EAF6EE] px-3 text-[13px] font-semibold text-[#1E7A41]">
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Analysis complete
          </span>
          <h2
            id="analysis-hero-title"
            className="m-0 font-brand text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-[#1F2328] [text-wrap:balance] md:text-[40px]"
          >
            {heroHeading(view)}
          </h2>
          <p className="m-0 max-w-[560px] text-[17.5px] leading-relaxed text-[#2E343B]">
            {view.has_pack_extraction
              ? "Here's what we found on each page, sorted into topics. Your Canonical Study will be assembled from this analysis. Until then, nothing here is a verified finding yet; each item shows the exact words it was read from."
              : "Itemized results for this analysis aren't shown here yet. Your Canonical Study will be assembled from this analysis; nothing here is a verified finding yet."}
          </p>
          {view.has_pack_extraction ? (
            <div className="flex flex-wrap gap-2.5 pt-1.5">
              <button
                type="button"
                onClick={() => goTo(NOT_FOUND_TARGET)}
                className="min-h-12 rounded-xl border border-[#D9DDE3] bg-white px-[18px] text-[15.5px] font-semibold text-[#1F2328] hover:bg-[#F4F6F8]"
              >
                What the reading didn&apos;t find
              </button>
            </div>
          ) : null}
        </div>
        <QuestionsBox questions={questions} />
      </section>

      {view.has_pack_extraction ? (
        <>
          <SummaryStrip view={view} />
          <Legend />
          <div className="grid grid-cols-1 items-start gap-9 lg:grid-cols-[240px_minmax(0,1fr)]">
            <nav aria-label="Topics" className="sticky top-5 hidden flex-col gap-0.5 lg:flex" data-testid="analysis-topic-nav">
              <div className="mb-3.5">
                <ViewSwitch mode={mode} onChange={setMode} />
              </div>
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goTo(item.id)}
                  className="flex min-h-10 items-center gap-2.5 rounded-[10px] border-0 bg-transparent px-3 text-left text-[14.5px] font-semibold text-[#1F2328] hover:bg-[#EEF0F3]"
                >
                  <span className="flex-1">{item.label}</span>
                  <span className="text-[12.5px] font-medium text-[#9AA3AE]">{item.count}</span>
                </button>
              ))}
            </nav>

            <div className="flex min-w-0 flex-col gap-5">
              <div className="flex flex-col gap-3 lg:hidden">
                <ViewSwitch mode={mode} onChange={setMode} />
                {mode === "topic" ? (
                  <nav aria-label="Topics" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
                    {navItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => goTo(item.id)}
                        className="h-11 flex-none whitespace-nowrap rounded-full border border-[#E1E4E9] bg-white px-3.5 text-[13.5px] font-semibold text-[#1F2328]"
                      >
                        {item.label}
                      </button>
                    ))}
                  </nav>
                ) : null}
              </div>

              {mode === "topic" ? (
                <>
                  {view.topics.map((topic) => (
                    <AnalysisTopicSection key={topic.id} topic={topic} />
                  ))}
                  <AnalysisNotFoundSection notFound={view.not_found} summary={view.summary} />
                </>
              ) : (
                <AnalysisDocumentList documents={view.documents} />
              )}

              <CanonicalStudyNextCard />
            </div>
          </div>
        </>
      ) : (
        <CanonicalStudyNextCard />
      )}
    </div>
  );
}

/** Loads persisted Pack extraction for a succeeded run and renders the Analysis Complete page. */
export function AnalysisCompletePanel({
  hiveId,
  studyRunId,
  questions,
  onGoToDocuments,
  lookupLabels = getDomainPackDisplayLabels,
}: {
  hiveId: string;
  studyRunId: string;
  questions: AnalysisQuestions;
  onGoToDocuments: () => void;
  lookupLabels?: LabelLookup;
}) {
  const [raw, setRaw] = useState<Awaited<ReturnType<typeof fetchStudyRunExtraction>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRaw(await fetchStudyRunExtraction(hiveId, studyRunId));
    } catch (err) {
      setRaw(null);
      setError(err instanceof StudyRunApiError ? err.message : "Could not load your analysis.");
    }
  }, [hiveId, studyRunId]);

  useEffect(() => {
    void load();
  }, [load]);

  const view = useMemo(() => (raw ? buildAnalysisView(raw, lookupLabels) : null), [raw, lookupLabels]);

  if (error) {
    return (
      <section className="rounded-[18px] border border-[#E7E9ED] bg-white p-6 md:p-8" data-testid="analysis-error">
        <h2 className="m-0 text-lg font-semibold text-[#1F2328]">Analysis complete</h2>
        <p role="alert" className="mt-2 text-sm text-[#4A525C]">
          {error}{" "}
          <button type="button" className="min-h-[44px] border-0 bg-transparent p-0 font-semibold underline" onClick={() => void load()}>
            Try again
          </button>
        </p>
      </section>
    );
  }
  if (!view) {
    return (
      <section className="rounded-[18px] border border-[#E7E9ED] bg-white p-6 md:p-8">
        <p role="status" className="m-0 text-sm text-[#4A525C]">
          Loading your analysis…
        </p>
      </section>
    );
  }
  return <AnalysisCompleteView view={view} questions={questions} onGoToDocuments={onGoToDocuments} />;
}
