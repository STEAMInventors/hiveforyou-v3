"use client";

import { ErrorCode } from "@hiveforyou/contracts/errors/v1";
import type { PackExtractionProgressV1 } from "@hiveforyou/contracts/pack-extraction/v1";
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
  classifyReadingArrival,
  type HiveProgressPollState,
  intentSignature,
  isTerminalStudyRunStatus,
  mergeMonotonicReadingProgress,
  nextDeliveryKey,
  type ReadingArrivalKind,
  resolveDisplayedIntent,
  studyRunStatusDecision,
} from "@/lib/study-runs/handoff";
import {
  fetchHiveProcessingHandoff,
  fetchStudyRunExtractionProgress,
  fetchStudyRunStatus,
  StudyRunApiError,
  submitStudyRun,
} from "@/lib/study-runs/client";

const POLL_INTERVAL_MS = 3000;
const POLL_FAILURES_BEFORE_NOTICE = 3;
const READING_PROGRESS_INTERVAL_MS = 15_000;

function minimizedStorageKey(hiveId: string): string {
  return `hfy-progress-minimized-${hiveId}`;
}

function readMinimizedRunIds(hiveId: string): Set<string> {
  if (typeof sessionStorage === "undefined") {
    return new Set();
  }
  try {
    const raw = sessionStorage.getItem(minimizedStorageKey(hiveId));
    if (!raw) {
      return new Set();
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function writeMinimizedRunIds(hiveId: string, ids: Set<string>): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  try {
    sessionStorage.setItem(minimizedStorageKey(hiveId), JSON.stringify([...ids]));
  } catch {
    // ignore quota / private mode
  }
}

export type HiveStudyRun = ReturnType<typeof useHiveStudyRun>;

/** One newly observed increase in finished documents; `seq` only grows, so consumers can skip seen events. */
export type ReadingArrival = {
  runId: string;
  seq: number;
  kind: ReadingArrivalKind;
  count: number;
  finished: number;
};

function pollStateFromFailures(failures: number, authExpired: boolean): HiveProgressPollState {
  if (authExpired) {
    return "auth_expired";
  }
  if (failures >= POLL_FAILURES_BEFORE_NOTICE) {
    return "reconnecting";
  }
  return "ok";
}

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
  const [progressOpen, setProgressOpen] = useState(false);
  const [lastPollSuccessAt, setLastPollSuccessAt] = useState<number | null>(null);
  const [pollFailures, setPollFailures] = useState(0);
  const [authPollExpired, setAuthPollExpired] = useState(false);
  const [readingProgress, setReadingProgress] = useState<PackExtractionProgressV1 | null>(null);
  const [readingProgressObservedAt, setReadingProgressObservedAt] = useState<number | null>(null);
  const [readingArrival, setReadingArrival] = useState<ReadingArrival | null>(null);
  const readingProgressRef = useRef<PackExtractionProgressV1 | null>(null);
  const readingProgressFetchedAtRef = useRef(0);
  const readingFinalAttemptRunIdRef = useRef<string | null>(null);
  const readingFinalRunIdRef = useRef<string | null>(null);
  /** Bumped whenever observation is interrupted; the next progress result after a bump is only a baseline. */
  const progressEpochRef = useRef(0);
  const progressObservedEpochRef = useRef(-1);
  const arrivalSeqRef = useRef(0);
  const statusRequestSeqRef = useRef(0);
  const statusSettledSeqRef = useRef(0);
  const progressOpenRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollFailuresRef = useRef(0);
  const activeRunRef = useRef<StudyRunSafeV1 | null>(null);
  const submittingRef = useRef(false);
  const deliveryRef = useRef<{ key: string; signature: string } | null>(null);
  const reuseDeliveryRef = useRef(false);
  const minimizedRunIdsRef = useRef<Set<string>>(readMinimizedRunIds(hiveId));
  const progressReturnFocusRef = useRef<HTMLElement | null>(null);

  activeRunRef.current = activeRun;
  progressOpenRef.current = progressOpen;

  useEffect(() => {
    minimizedRunIdsRef.current = readMinimizedRunIds(hiveId);
  }, [hiveId]);

  const pollState = pollStateFromFailures(pollFailures, authPollExpired);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const maybeOpenProgress = useCallback((run: StudyRunSafeV1) => {
    if (isTerminalStudyRunStatus(run.status)) {
      return;
    }
    if (!minimizedRunIdsRef.current.has(run.id)) {
      setProgressOpen(true);
    }
  }, []);

  const breakProgressContinuity = useCallback(() => {
    progressEpochRef.current += 1;
  }, []);

  const resetReadingProgress = useCallback(() => {
    breakProgressContinuity();
    readingProgressRef.current = null;
    readingProgressFetchedAtRef.current = 0;
    setReadingProgress(null);
    setReadingProgressObservedAt(null);
    setReadingArrival(null);
  }, [breakProgressContinuity]);

  /**
   * Optional signal: failures keep the last known counts and never affect status polling. While
   * reading it refreshes on an interval; once a run with counts leaves reading, one final read
   * records the closing counts (retried on the same interval until it succeeds).
   */
  const maybeRefreshReadingProgress = useCallback(
    async (run: StudyRunSafeV1) => {
      if (!progressOpenRef.current) {
        return;
      }
      const reading = run.stage === "extract" && !isTerminalStudyRunStatus(run.status);
      const closing =
        !reading && readingProgressRef.current != null && readingFinalRunIdRef.current !== run.id;
      if (!reading && !closing) {
        return;
      }
      const firstClosingAttempt = closing && readingFinalAttemptRunIdRef.current !== run.id;
      if (
        !firstClosingAttempt &&
        Date.now() - readingProgressFetchedAtRef.current < READING_PROGRESS_INTERVAL_MS
      ) {
        return;
      }
      if (closing) {
        readingFinalAttemptRunIdRef.current = run.id;
      }
      readingProgressFetchedAtRef.current = Date.now();
      const epoch = progressEpochRef.current;
      try {
        const next = await fetchStudyRunExtractionProgress(hiveId, run.id);
        const current = activeRunRef.current;
        if (next.study_run_id !== current?.id) {
          return;
        }
        const previous = readingProgressRef.current;
        const merged = mergeMonotonicReadingProgress(previous, next);
        if (merged.documents_finished > (previous?.documents_finished ?? 0)) {
          setReadingProgressObservedAt(Date.now());
        }
        readingProgressRef.current = merged;
        setReadingProgress(merged);
        if (closing) {
          readingFinalRunIdRef.current = run.id;
        }

        const sameEpoch = epoch === progressEpochRef.current;
        const arrival = classifyReadingArrival({
          previousFinished: previous?.documents_finished ?? null,
          nextFinished: merged.documents_finished,
          continuous: sameEpoch && progressObservedEpochRef.current === epoch,
        });
        if (sameEpoch) {
          progressObservedEpochRef.current = epoch;
        }
        if (arrival && current.stage === "extract" && !isTerminalStudyRunStatus(current.status)) {
          arrivalSeqRef.current += 1;
          setReadingArrival({
            runId: current.id,
            seq: arrivalSeqRef.current,
            kind: arrival.kind,
            count: arrival.count,
            finished: merged.documents_finished,
          });
        }
      } catch {
        // progress is supplementary; status polling owns reconnect messaging
        breakProgressContinuity();
      }
    },
    [breakProgressContinuity, hiveId],
  );

  const refreshRun = useCallback(
    async (studyRunId: string) => {
      statusRequestSeqRef.current += 1;
      const requestSeq = statusRequestSeqRef.current;
      try {
        const result = await fetchStudyRunStatus(hiveId, studyRunId);
        const decision = studyRunStatusDecision({
          requestSeq,
          latestSettledSeq: statusSettledSeqRef.current,
          current: activeRunRef.current,
          next: result.study_run,
        });
        if (decision === "stale") {
          return;
        }
        statusSettledSeqRef.current = requestSeq;
        pollFailuresRef.current = 0;
        setPollFailures(0);
        setAuthPollExpired(false);
        setLastPollSuccessAt(Date.now());
        setStatusNote(null);
        if (decision === "keep_current") {
          return;
        }
        setActiveRun(result.study_run);
        activeRunRef.current = result.study_run;
        setPlanningSummary(result.planning_summary);
        void maybeRefreshReadingProgress(result.study_run);
        if (isTerminalStudyRunStatus(result.study_run.status)) {
          stopPolling();
          setLocked(false);
          const saved = readHiveIntentDraft(hiveId);
          if (saved) {
            setRequestText(saved.rawIntent);
            setDomainId(saved.selectedDomainId);
          }
        }
      } catch (err) {
        if (requestSeq <= statusSettledSeqRef.current) {
          throw err;
        }
        statusSettledSeqRef.current = requestSeq;
        breakProgressContinuity();
        if (err instanceof StudyRunApiError && err.envelope.error_code === ErrorCode.AUTH_FAILED) {
          setAuthPollExpired(true);
          setStatusNote("Sign in again to see live updates.");
        }
        pollFailuresRef.current += 1;
        setPollFailures(pollFailuresRef.current);
        if (pollFailuresRef.current >= POLL_FAILURES_BEFORE_NOTICE) {
          setStatusNote("We're having trouble reaching HiveForYou. We'll keep trying.");
        }
        throw err;
      }
    },
    [breakProgressContinuity, hiveId, maybeRefreshReadingProgress, stopPolling],
  );

  const startPolling = useCallback(
    (studyRunId: string) => {
      stopPolling();
      pollFailuresRef.current = 0;
      setPollFailures(0);
      setAuthPollExpired(false);
      pollRef.current = setInterval(() => {
        void refreshRun(studyRunId).catch(() => undefined);
      }, POLL_INTERVAL_MS);
    },
    [refreshRun, stopPolling],
  );

  const attachToRun = useCallback(
    (run: StudyRunSafeV1, summary: StudyRunPlanningSummarySafeV1 | null, openProgress = true) => {
      if (activeRunRef.current?.id !== run.id) {
        resetReadingProgress();
      }
      activeRunRef.current = run;
      setActiveRun(run);
      setPlanningSummary(summary);
      if (!isTerminalStudyRunStatus(run.status)) {
        setLocked(true);
        startPolling(run.id);
        if (openProgress) {
          maybeOpenProgress(run);
        }
      }
    },
    [maybeOpenProgress, resetReadingProgress, startPolling],
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
          attachToRun(handoff.study_run, handoff.planning_summary, true);
          setLastPollSuccessAt(Date.now());
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
      if (document.visibilityState !== "visible") {
        breakProgressContinuity();
        return;
      }
      const run = activeRunRef.current;
      if (run && !isTerminalStudyRunStatus(run.status)) {
        void refreshRun(run.id).catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [breakProgressContinuity, refreshRun]);

  const saveQuestion = useCallback(
    (nextText: string) => {
      setRequestText(nextText);
      saveHiveIntentDraft({ hiveId, rawIntent: nextText, selectedDomainId: domainId });
    },
    [hiveId, domainId],
  );

  const openProgress = useCallback(() => {
    const run = activeRunRef.current;
    if (!run || isTerminalStudyRunStatus(run.status)) {
      return;
    }
    minimizedRunIdsRef.current.delete(run.id);
    writeMinimizedRunIds(hiveId, minimizedRunIdsRef.current);
    breakProgressContinuity();
    progressOpenRef.current = true;
    setProgressOpen(true);
    void maybeRefreshReadingProgress(run);
  }, [breakProgressContinuity, hiveId, maybeRefreshReadingProgress]);

  const minimizeProgress = useCallback(() => {
    const run = activeRunRef.current;
    if (run && !isTerminalStudyRunStatus(run.status)) {
      minimizedRunIdsRef.current.add(run.id);
      writeMinimizedRunIds(hiveId, minimizedRunIdsRef.current);
    }
    breakProgressContinuity();
    setProgressOpen(false);
  }, [breakProgressContinuity, hiveId]);

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
        attachToRun(latest.study_run, latest.planning_summary, true);
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
      minimizedRunIdsRef.current.delete(result.study_run.id);
      writeMinimizedRunIds(hiveId, minimizedRunIdsRef.current);
      attachToRun(result.study_run, null, true);
      setLastPollSuccessAt(Date.now());
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
    progressOpen,
    pollState,
    lastPollSuccessAt,
    readingProgress,
    readingProgressObservedAt,
    readingArrival,
    progressReturnFocusRef,
    saveQuestion,
    submit,
    openProgress,
    minimizeProgress,
  };
}
