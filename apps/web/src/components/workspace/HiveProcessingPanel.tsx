"use client";

import { ErrorCode } from "@hiveforyou/contracts/errors/v1";
import type {
  StudyRunPlanningSummarySafeV1,
  StudyRunSafeV1,
} from "@hiveforyou/contracts/study-runs/v1";
import { useCallback, useEffect, useRef, useState } from "react";

import { listPublicDomainPacks } from "@/lib/domain-packs/public-metadata";
import { adoptLandingIntentForHive, readHiveIntentDraft, saveHiveIntentDraft } from "@/lib/landing/hive-intent-draft";
import {
  buildAnalyzeSubmitBody,
  intentSignature,
  isTerminalStudyRunStatus,
  nextDeliveryKey,
  resolveDisplayedIntent,
} from "@/lib/study-runs/handoff";
import {
  fetchHiveProcessingHandoff,
  fetchStudyRunStatus,
  StudyRunApiError,
  submitStudyRun,
} from "@/lib/study-runs/client";

function formatStage(stage: string): string {
  return stage.replaceAll("_", " ");
}

type HiveProcessingPanelProps = {
  hiveId: string;
};

export function HiveProcessingPanel({ hiveId }: HiveProcessingPanelProps) {
  const packs = listPublicDomainPacks();
  const [requestText, setRequestText] = useState("");
  const [domainId, setDomainId] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<StudyRunSafeV1 | null>(null);
  const [planningSummary, setPlanningSummary] = useState<StudyRunPlanningSummarySafeV1 | null>(
    null,
  );
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submittingRef = useRef(false);
  const deliveryRef = useRef<{ key: string; signature: string } | null>(null);
  const reuseDeliveryRef = useRef(false);

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
      setStatusNote(null);
      if (isTerminalStudyRunStatus(result.study_run.status)) {
        stopPolling();
        setLocked(false);
        const saved = readHiveIntentDraft(hiveId);
        if (saved) {
          setRequestText(saved.rawIntent);
          setDomainId(saved.selectedDomainId);
        }
      }
    },
    [hiveId, stopPolling],
  );

  const startPolling = useCallback(
    (studyRunId: string) => {
      stopPolling();
      pollRef.current = setInterval(() => {
        void refreshRun(studyRunId).catch(() => {
          setStatusNote("Could not refresh processing status. This page will keep trying.");
        });
      }, 3000);
    },
    [refreshRun, stopPolling],
  );

  useEffect(() => {
    let cancelled = false;
    const local = adoptLandingIntentForHive(hiveId);
    if (local) {
      setRequestText(local.rawIntent);
      setDomainId(local.selectedDomainId);
    }
    void fetchHiveProcessingHandoff(hiveId)
      .then((handoff) => {
        if (cancelled) {
          return;
        }
        const currentLocal = readHiveIntentDraft(hiveId) ?? local;
        const resolved = resolveDisplayedIntent({
          local: currentLocal,
          server: handoff.study_run
            ? {
                intentRequestText: handoff.intent_request_text,
                domainHint: handoff.domain_hint,
                runStatus: handoff.study_run.status,
              }
            : null,
        });
        setRequestText(resolved.rawIntent);
        setDomainId(resolved.selectedDomainId);
        setLocked(resolved.locked);
        if (!resolved.locked && !currentLocal && resolved.rawIntent.trim()) {
          saveHiveIntentDraft({
            hiveId,
            rawIntent: resolved.rawIntent,
            selectedDomainId: resolved.selectedDomainId,
          });
        }
        if (handoff.study_run) {
          setActiveRun(handoff.study_run);
          setPlanningSummary(handoff.planning_summary);
          if (!isTerminalStudyRunStatus(handoff.study_run.status)) {
            startPolling(handoff.study_run.id);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatusNote("Could not load processing status. Your question is still on this page.");
        }
      });
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [hiveId, startPolling, stopPolling]);

  const persistDraft = (nextText: string, nextDomain: string | null) => {
    saveHiveIntentDraft({
      hiveId,
      rawIntent: nextText,
      selectedDomainId: nextDomain,
    });
  };

  const handleSubmit = async () => {
    if (submittingRef.current || locked) {
      return;
    }
    const trimmed = requestText.trim();
    if (!trimmed) {
      setError("Describe what you want this study to answer.");
      return;
    }
    const signature = intentSignature(trimmed, domainId);
    const delivery = nextDeliveryKey({
      previous: deliveryRef.current,
      signature,
      reusePrevious: reuseDeliveryRef.current,
      createKey: () => crypto.randomUUID(),
    });
    deliveryRef.current = delivery;
    const body = buildAnalyzeSubmitBody({
      requestText: trimmed,
      domainId,
      idempotencyKey: delivery.key,
    });

    submittingRef.current = true;
    setBusy(true);
    setError(null);
    setStatusNote(null);
    stopPolling();
    try {
      const result = await submitStudyRun(hiveId, body);
      reuseDeliveryRef.current = false;
      deliveryRef.current = null;
      const sentDomain = body.clarification_json?.domain_hint ?? null;
      setRequestText(body.request_text);
      setDomainId(sentDomain);
      persistDraft(body.request_text, sentDomain);
      setActiveRun(result.study_run);
      setPlanningSummary(null);
      setLocked(!isTerminalStudyRunStatus(result.study_run.status));
      if (!isTerminalStudyRunStatus(result.study_run.status)) {
        startPolling(result.study_run.id);
      }
    } catch (err) {
      const retrySaved =
        err instanceof StudyRunApiError &&
        err.envelope.error_code === ErrorCode.DEPENDENCY_UNAVAILABLE;
      reuseDeliveryRef.current = retrySaved;
      if (!retrySaved) {
        deliveryRef.current = null;
      }
      setError(
        err instanceof StudyRunApiError
          ? err.message
          : "Could not start processing. Try again.",
      );
      setLocked(false);
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  };

  const runInProgress = activeRun != null && !isTerminalStudyRunStatus(activeRun.status);
  const inputsLocked = busy || locked || runInProgress;
  const showRetry = Boolean(error) || activeRun?.status === "FAILED";
  const knownDomain = packs.some((pack) => pack.domain_id === domainId);
  const domainOptions = packs.filter((pack) => pack.executable || pack.domain_id === domainId);

  return (
    <section className="rounded-[18px] border border-[#E7E9ED] bg-white p-6 md:p-8">
      <h2 className="m-0 text-lg font-semibold text-[#1F2328]">Analyze documents</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#4A525C]">
        Your question is sent with this Hive&apos;s registered documents. Status is read from
        durable storage, not this browser session alone.
      </p>

      <label className="mt-6 block text-sm font-medium text-[#1F2328]" htmlFor="study-request-text">
        What should this study answer?
      </label>
      <textarea
        id="study-request-text"
        className="mt-2 min-h-[120px] w-full max-w-2xl rounded-[12px] border border-[#E3E3E3] px-3 py-2 text-sm text-[#1F2328]"
        value={requestText}
        onChange={(event) => {
          const next = event.target.value;
          setRequestText(next);
          persistDraft(next, domainId);
        }}
        disabled={inputsLocked}
        data-testid="study-request-text"
      />

      <label className="mt-4 block text-sm font-medium text-[#1F2328]" htmlFor="study-domain-hint">
        Domain hint (optional)
      </label>
      <select
        id="study-domain-hint"
        className="mt-2 w-full max-w-md rounded-[12px] border border-[#E3E3E3] bg-white px-3 py-2 text-sm text-[#1F2328]"
        value={domainId ?? ""}
        disabled={inputsLocked}
        data-testid="study-domain-hint"
        onChange={(event) => {
          const next = event.target.value ? event.target.value : null;
          setDomainId(next);
          persistDraft(requestText, next);
        }}
      >
        <option value="">No domain</option>
        {!knownDomain && domainId ? <option value={domainId}>{domainId}</option> : null}
        {domainOptions.map((pack) => (
          <option key={pack.domain_id} value={pack.domain_id}>
            {pack.short_label}
          </option>
        ))}
      </select>
      <p className="mt-2 max-w-2xl text-sm text-[#4A525C]">
        A domain hint does not force classification. Leave this empty to process without a domain
        pack.
      </p>

      {error ? (
        <p className="mt-3 text-sm text-[#B42318]" role="alert">
          {error}
        </p>
      ) : null}
      {statusNote ? (
        <p className="mt-3 text-sm text-[#875700]" role="status">
          {statusNote}
        </p>
      ) : null}

      <button
        type="button"
        className="mt-4 rounded-[10px] bg-[#2F6FE4] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        disabled={inputsLocked || !requestText.trim()}
        onClick={() => void handleSubmit()}
        data-testid="analyze-documents"
      >
        {busy ? "Submitting…" : runInProgress ? "Analyzing…" : showRetry ? "Retry analysis" : "Analyze documents"}
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
          {activeRun.correlation_id ? (
            <p className="mt-2 m-0 text-[#4A525C]">Reference {activeRun.correlation_id}</p>
          ) : null}
          {activeRun.error_message_safe ? (
            <p className="mt-2 m-0 text-[#B42318]" role="alert">
              {activeRun.error_message_safe}
            </p>
          ) : null}
          {activeRun.status === "FAILED" ? (
            <p className="mt-2 m-0 text-[#4A525C]">
              This run failed. Retry analysis starts a new processing run with the question above.
            </p>
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
