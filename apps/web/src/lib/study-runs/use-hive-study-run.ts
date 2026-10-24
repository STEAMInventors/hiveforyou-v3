"use client";

import { ErrorCode } from "@hiveforyou/contracts/errors/v1";
import type {
  StudyRunPlanningSummarySafeV1,
  StudyRunSafeV1,
} from "@hiveforyou/contracts/study-runs/v1";
import { useCallback, useEffect, useRef, useState } from "react";

import { adoptLandingIntentForHive, readHiveIntentDraft, saveHiveIntentDraft } from "@/lib/landing/hive-intent-draft";
import {
  ANALYZE_MISSING_QUESTION_MESSAGE,
  buildAnalyzeSubmitBody,
  capturedQuestionForAnalyze,
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

const POLL_INTERVAL_MS = 3000;
const POLL_FAILURES_BEFORE_NOTICE = 3;

export type HiveStudyRun = ReturnType<typeof useHiveStudyRun>;

export function useHiveStudyRun(hiveId: string) {
  const [requestText, setRequestText] = useState("");
  const [domainId, setDomainId] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<StudyRunSafeV1 | null>(null);
  const [planningSummary, setPlanningSummary] = useState<StudyRunPlanningSummarySafeV1 | null>(
    null,
  );
  const [lastIntent, setLastIntent] = useState<{
    requestText: string | null;
    domainId: string | null;
  }>({ requestText: null, domainId: null });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollFailuresRef = useRef(0);
  const activeRunRef = useRef<StudyRunSafeV1 | null>(null);
  const submittingRef = useRef(false);
  const deliveryRef = useRef<{ key: string; signature: string } | null>(null);
  const reuseDeliveryRef = useRef(false);

  activeRunRef.current = activeRun;

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const refreshRun = useCallback(
    async (studyRunId: string) => {
      const result = await fetchStudyRunStatus(hiveId, studyRunId);
      pollFailuresRef.current = 0;
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
      pollFailuresRef.current = 0;
      pollRef.current = setInterval(() => {
        void refreshRun(studyRunId).catch(() => {
          pollFailuresRef.current += 1;
          if (pollFailuresRef.current >= POLL_FAILURES_BEFORE_NOTICE) {
            setStatusNote("We're having trouble reaching HiveForYou. We'll keep trying.");
          }
        });
      }, POLL_INTERVAL_MS);
    },
    [refreshRun, stopPolling],
  );

  const attachToRun = useCallback(
    (run: StudyRunSafeV1, summary: StudyRunPlanningSummarySafeV1 | null) => {
      setActiveRun(run);
      setPlanningSummary(summary);
      if (!isTerminalStudyRunStatus(run.status)) {
        setLocked(true);
        startPolling(run.id);
      }
    },
    [startPolling],
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
        setLastIntent({
          requestText: handoff.intent_request_text,
          domainId: handoff.domain_hint,
        });
        if (!resolved.locked && !currentLocal && resolved.rawIntent.trim()) {
          saveHiveIntentDraft({
            hiveId,
            rawIntent: resolved.rawIntent,
            selectedDomainId: resolved.selectedDomainId,
          });
        }
        if (handoff.study_run) {
          attachToRun(handoff.study_run, handoff.planning_summary);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatusNote("Could not load your latest analysis. Your question is still on this page.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [hiveId, attachToRun, stopPolling]);

  useEffect(() => {
    const onVisible = () => {
      const run = activeRunRef.current;
      if (document.visibilityState === "visible" && run && !isTerminalStudyRunStatus(run.status)) {
        void refreshRun(run.id).catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshRun]);

  const saveQuestion = useCallback(
    (nextText: string) => {
      setRequestText(nextText);
      saveHiveIntentDraft({ hiveId, rawIntent: nextText, selectedDomainId: domainId });
    },
    [hiveId, domainId],
  );

  /** Attaches to a run another tab already started instead of submitting a second one. */
  const submit = useCallback(async () => {
    if (submittingRef.current || locked) {
      return;
    }
    const trimmed = capturedQuestionForAnalyze(requestText);
    if (!trimmed) {
      setError(ANALYZE_MISSING_QUESTION_MESSAGE);
      return;
    }

    submittingRef.current = true;
    setBusy(true);
    setError(null);
    setStatusNote(null);
    stopPolling();
    try {
      const latest = await fetchHiveProcessingHandoff(hiveId).catch(() => null);
      if (latest?.study_run && !isTerminalStudyRunStatus(latest.study_run.status)) {
        setLastIntent({ requestText: latest.intent_request_text, domainId: latest.domain_hint });
        attachToRun(latest.study_run, latest.planning_summary);
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

      const result = await submitStudyRun(hiveId, body);
      reuseDeliveryRef.current = false;
      deliveryRef.current = null;
      const sentDomain = body.clarification_json?.domain_hint ?? null;
      setRequestText(body.request_text);
      setDomainId(sentDomain);
      saveHiveIntentDraft({ hiveId, rawIntent: body.request_text, selectedDomainId: sentDomain });
      setLastIntent({ requestText: body.request_text, domainId: sentDomain });
      setLocked(!isTerminalStudyRunStatus(result.study_run.status));
      attachToRun(result.study_run, null);
    } catch (err) {
      const retrySaved =
        err instanceof StudyRunApiError &&
        err.envelope.error_code === ErrorCode.DEPENDENCY_UNAVAILABLE;
      reuseDeliveryRef.current = retrySaved;
      if (!retrySaved) {
        deliveryRef.current = null;
      }
      setError(
        err instanceof StudyRunApiError ? err.message : "Could not start your analysis. Try again.",
      );
      setLocked(false);
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }, [attachToRun, domainId, hiveId, locked, requestText, stopPolling]);

  return {
    requestText,
    domainId,
    locked,
    busy,
    loaded,
    error,
    statusNote,
    activeRun,
    planningSummary,
    lastIntent,
    saveQuestion,
    submit,
  };
}
