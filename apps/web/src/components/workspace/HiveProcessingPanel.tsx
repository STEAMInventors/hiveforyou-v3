"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  StudyRunPlanningSummarySafeV1,
  StudyRunSafeV1,
} from "@hiveforyou/contracts/study-runs/v1";

import { fetchStudyRunStatus, submitStudyRun, StudyRunApiError } from "@/lib/study-runs/client";

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

function formatStage(stage: string): string {
  return stage.replaceAll("_", " ");
}

type HiveProcessingPanelProps = {
  hiveId: string;
};

export function HiveProcessingPanel({ hiveId }: HiveProcessingPanelProps) {
  const [requestText, setRequestText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<StudyRunSafeV1 | null>(null);
  const [planningSummary, setPlanningSummary] = useState<StudyRunPlanningSummarySafeV1 | null>(
    null,
  );
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const refreshRun = useCallback(
    async (studyRunId: string) => {
      const result = await fetchStudyRunStatus(hiveId, studyRunId);
      setActiveRun(result.study_run);
      setPlanningSummary(result.planning_summary);
      if (TERMINAL.has(result.study_run.status)) {
        stopPolling();
      }
    },
    [hiveId, stopPolling],
  );

  useEffect(() => () => stopPolling(), [stopPolling]);

  const handleSubmit = async () => {
    const trimmed = requestText.trim();
    if (!trimmed) {
      setError("Describe what you want this study to answer.");
      return;
    }
    setBusy(true);
    setError(null);
    setPlanningSummary(null);
    stopPolling();
    try {
      const deliveryKey = crypto.randomUUID();
      const result = await submitStudyRun(hiveId, {
        request_text: trimmed,
        trigger: "study",
        idempotency_key: deliveryKey,
      });
      setActiveRun(result.study_run);
      pollRef.current = setInterval(() => {
        void refreshRun(result.study_run.id).catch(() => {
          /* keep polling until terminal or user leaves */
        });
      }, 3000);
    } catch (err) {
      setError(
        err instanceof StudyRunApiError
          ? err.message
          : "Could not start processing. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-[18px] border border-[#E7E9ED] bg-white p-6 md:p-8">
      <h2 className="m-0 text-lg font-semibold text-[#1F2328]">Start processing</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#4A525C]">
        Submit runs against your registered documents. Status is read from durable storage, not
        this browser session alone.
      </p>

      <label className="mt-6 block text-sm font-medium text-[#1F2328]" htmlFor="study-request-text">
        What should this study answer?
      </label>
      <textarea
        id="study-request-text"
        className="mt-2 min-h-[120px] w-full max-w-2xl rounded-[12px] border border-[#E3E3E3] px-3 py-2 text-sm text-[#1F2328]"
        value={requestText}
        onChange={(event) => setRequestText(event.target.value)}
        disabled={busy}
        data-testid="study-request-text"
      />

      {error ? (
        <p className="mt-3 text-sm text-[#B42318]" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        className="mt-4 rounded-[10px] bg-[#2F6FE4] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        disabled={busy}
        onClick={() => void handleSubmit()}
        data-testid="study-submit"
      >
        {busy ? "Submitting…" : "Submit for processing"}
      </button>

      {activeRun ? (
        <div
          className="mt-8 rounded-[12px] border border-[#E7E9ED] bg-[#F9FAFB] p-4 text-left text-sm"
          data-testid="study-run-status"
        >
          <p className="m-0 font-semibold text-[#1F2328]">Run {activeRun.id.slice(0, 8)}…</p>
          <p className="mt-2 m-0 text-[#4A525C]">
            Status: <span className="font-medium text-[#1F2328]">{activeRun.status}</span>
            {" · "}
            Stage: <span className="font-medium text-[#1F2328]">{formatStage(activeRun.stage)}</span>
          </p>
          {activeRun.error_message_safe ? (
            <p className="mt-2 m-0 text-[#B42318]">{activeRun.error_message_safe}</p>
          ) : null}
          {planningSummary && planningSummary.merged_question_count > 0 ? (
            <div className="mt-4 border-t border-[#E7E9ED] pt-3">
              <p className="m-0 font-medium text-[#1F2328]">Planning summary</p>
              <p className="mt-1 m-0 text-[#4A525C]">
                {planningSummary.merged_question_count} merged question
                {planningSummary.merged_question_count === 1 ? "" : "s"}
                {planningSummary.budget_outcome
                  ? ` · Budget: ${planningSummary.budget_outcome.replaceAll("_", " ").toLowerCase()}`
                  : null}
              </p>
              <ul className="mt-2 mb-0 list-disc pl-5 text-[#4A525C]">
                {planningSummary.merged_question_labels.slice(0, 8).map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
