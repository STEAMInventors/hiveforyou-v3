"use client";

import { AnalysisCompletePanel, type AnalysisQuestions } from "@/components/workspace/analysis/AnalysisCompletePanel";
import { ExtractedFactsPanel } from "@/components/workspace/ExtractedFactsPanel";
import { isTerminalStudyRunStatus, studyRunSummaryText } from "@/lib/study-runs/handoff";
import type { HiveStudyRun } from "@/lib/study-runs/use-hive-study-run";

type CanonicalStudyStatusPanelProps = {
  study: HiveStudyRun;
  documentCount: number | null;
  onGoToDocuments: () => void;
  onOpenProgress: () => void;
};

const LINK_BUTTON =
  "mt-5 inline-flex h-10 items-center rounded-[10px] border border-[#D9DDE3] bg-white px-4 text-sm font-semibold text-[#1F2328] hover:bg-[#F4F6F8]";

function analysisQuestions(study: HiveStudyRun): AnalysisQuestions {
  const labels = study.planningSummary?.merged_question_labels ?? [];
  if (labels.length > 0) {
    return { heading: "Questions this study will cover", items: labels.slice(0, 8) };
  }
  const own = study.lastIntent.requestText?.trim();
  return { heading: "Your question", items: own ? [own] : [] };
}

/** Read-only: submitting lives on the Documents tab so there is one way to start an analysis. */
export function CanonicalStudyStatusPanel({
  study,
  documentCount,
  onGoToDocuments,
  onOpenProgress,
}: CanonicalStudyStatusPanelProps) {
  const run = study.activeRun;

  if (study.loaded && run?.status === "SUCCEEDED") {
    return (
      <AnalysisCompletePanel
        hiveId={run.hive_id}
        studyRunId={run.id}
        questions={analysisQuestions(study)}
        onGoToDocuments={onGoToDocuments}
      />
    );
  }

  let title: string;
  let body: string;
  let action: string;
  if (!study.loaded) {
    title = "Canonical Study";
    body = "Loading…";
    action = "";
  } else if (!run) {
    title = "Your study starts with your documents";
    body =
      "Add your question and documents, then choose Continue on the Documents tab. Your Canonical Study is assembled from that analysis.";
    action = "Go to Documents";
  } else if (!isTerminalStudyRunStatus(run.status)) {
    title = "Analysis in progress";
    body = studyRunSummaryText(run, documentCount) ?? "";
    action = "View progress";
  } else {
    title = "Your last analysis didn't finish";
    body = "Your documents are safe. You can try again from the Documents tab.";
    action = "Go to Documents";
  }

  return (
    <section
      className="rounded-[18px] border border-[#E7E9ED] bg-white p-6 md:p-8"
      data-testid="canonical-study-status"
    >
      <h2 className="m-0 text-lg font-semibold text-[#1F2328]">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#4A525C]">{body}</p>
      {run && isTerminalStudyRunStatus(run.status) ? (
        <ExtractedFactsPanel hiveId={run.hive_id} studyRunId={run.id} />
      ) : null}
      {action ? (
        <button
          type="button"
          className={LINK_BUTTON}
          onClick={() => {
            if (action === "View progress") {
              study.progressReturnFocusRef.current =
                document.activeElement instanceof HTMLElement ? document.activeElement : null;
              onOpenProgress();
            } else {
              onGoToDocuments();
            }
          }}
        >
          {action}
        </button>
      ) : null}
    </section>
  );
}
