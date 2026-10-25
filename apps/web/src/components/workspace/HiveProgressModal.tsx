"use client";

import { StudyRunStatus } from "@hiveforyou/contracts/errors/v1";
import type { StudyRunSafeV1 } from "@hiveforyou/contracts/study-runs/v1";
import { type CSSProperties, useEffect, useId, useRef, useState } from "react";

import {
  HONEYCOMB_COLORS,
  type HoneycombArrival,
  HoneycombActivity,
  type LivingHiveMode,
} from "@/components/workspace/HoneycombActivity";
import { handleModalTabKeyDown, safeReturnFocus } from "@/lib/a11y/modal-focus";
import { usePrefersReducedMotion } from "@/lib/a11y/reduced-motion";
import {
  type HiveProgressPollState,
  isReadingStageComplete,
  isStudyRunUpdateStale,
  isTerminalStudyRunStatus,
  latestActivityIso,
  livingHiveCopy,
  mergeMonotonicStageIndex,
  readingArrivalMessage,
  readingCounter,
  type ReadingProgressCounts,
  studyProgressSteps,
  studyRunQuestionLine,
  studyRunStaleNotice,
} from "@/lib/study-runs/handoff";

export type { HiveProgressPollState };

type HiveProgressModalProps = {
  open: boolean;
  run: StudyRunSafeV1 | null;
  hiveName?: string | null;
  documentCount: number | null;
  /** Filenames of the documents included in this run; null while the list is loading. */
  documentNames?: readonly string[] | null;
  questionCount?: number | null;
  readingProgress?: ReadingProgressCounts | null;
  readingProgressObservedAt?: number | null;
  readingArrival?: (HoneycombArrival & { runId: string }) | null;
  pollState: HiveProgressPollState;
  lastPollSuccessAt: number | null;
  returnFocusRef: React.RefObject<HTMLElement | null>;
  onMinimize: () => void;
  onViewResults: () => void;
  /** Starts a new analysis through the same submit path as Continue; omitted when not allowed. */
  onRetry?: (() => void) | null;
  retryBusy?: boolean;
  retryError?: string | null;
};

const SECONDARY =
  "inline-flex min-h-[44px] items-center justify-center rounded-[11px] border border-[#D9DDE3] bg-white px-[18px] text-[15px] font-semibold text-[#1F2328] hover:bg-[#F4F6F8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B7CF6] disabled:cursor-not-allowed disabled:opacity-[.42]";
const PRIMARY =
  "inline-flex min-h-[46px] items-center justify-center rounded-[12px] bg-[#2F6FE4] px-[22px] text-[15.5px] font-semibold text-white hover:bg-[#2659C2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B7CF6] disabled:cursor-not-allowed disabled:opacity-[.42]";
const PRIMARY_COMPACT =
  "inline-flex min-h-[44px] items-center justify-center rounded-[11px] bg-[#2F6FE4] px-5 text-[15px] font-semibold text-white hover:bg-[#2659C2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B7CF6] disabled:cursor-not-allowed disabled:opacity-[.42]";

const COUNT_PULSE_MS = 900;
const CHIP_MS = 1600;
const CHIP_REDUCED_MS = 2200;
const SEGMENT_STAGGER_MS = 90;
const SYNC_MESSAGE = "Reading complete. Moving on to finishing up.";

export function HiveProgressModal(props: HiveProgressModalProps) {
  if (!props.open || !props.run) {
    return null;
  }
  return <LivingHiveDialog key={props.run.id} {...props} run={props.run} />;
}

function honeycombMode(status: string): LivingHiveMode {
  switch (status) {
    case StudyRunStatus.RUNNING:
      return "processing";
    case StudyRunStatus.SUCCEEDED:
      return "success";
    case StudyRunStatus.FAILED:
      return "failed";
    default:
      return "still";
  }
}

function LivingHiveDialog({
  run,
  hiveName = null,
  documentCount,
  documentNames = null,
  questionCount = null,
  readingProgress = null,
  readingProgressObservedAt = null,
  readingArrival = null,
  pollState,
  returnFocusRef,
  onMinimize,
  onViewResults,
  onRetry = null,
  retryBusy = false,
  retryError = null,
}: HiveProgressModalProps & { run: StudyRunSafeV1 }) {
  const titleId = useId();
  const docsListId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const maxStageRef = useRef(-1);
  const reducedMotion = usePrefersReducedMotion();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [docsOpen, setDocsOpen] = useState(true);
  const [retryRequested, setRetryRequested] = useState(false);

  maxStageRef.current = mergeMonotonicStageIndex(maxStageRef.current, run.stage);
  const readingDone = isReadingStageComplete(maxStageRef.current);
  const terminal = isTerminalStudyRunStatus(run.status);
  const active = !terminal;
  const counter = readingCounter(readingProgress);
  const arrival = readingArrival && readingArrival.runId === run.id ? readingArrival : null;

  const seenArrivalSeqRef = useRef(arrival?.seq ?? 0);
  const baselineRef = useRef({ read: counter?.read ?? 0, unusable: counter?.unusable ?? 0 });
  const readingDoneSeenRef = useRef(readingDone);
  const [liveMessage, setLiveMessage] = useState<string | null>(null);
  const [countPulse, setCountPulse] = useState<{ id: number; color: string } | null>(null);
  const [chip, setChip] = useState<{ id: number; label: string } | null>(null);
  const [staggerFrom, setStaggerFrom] = useState<number | null>(null);

  useEffect(() => {
    const tick = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onMinimize();
        safeReturnFocus(returnFocusRef.current);
        return;
      }
      handleModalTabKeyDown(event, overlayRef.current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onMinimize, returnFocusRef]);

  const counterRead = counter?.read ?? 0;
  const counterUnusable = counter?.unusable ?? 0;
  const arrivalSeq = arrival?.seq ?? 0;
  const arrivalKind = arrival?.kind ?? "single";
  const arrivalFinished = arrival?.finished ?? 0;

  useEffect(() => {
    const baseline = baselineRef.current;
    baselineRef.current = { read: counterRead, unusable: counterUnusable };
    if (arrivalSeq <= seenArrivalSeqRef.current) {
      return;
    }
    seenArrivalSeqRef.current = arrivalSeq;
    if (!active) {
      return;
    }
    const readDelta = Math.max(0, counterRead - baseline.read);
    const unusableDelta = Math.max(0, counterUnusable - baseline.unusable);
    if (readDelta + unusableDelta === 0) {
      return;
    }
    setLiveMessage(readingArrivalMessage(readDelta + unusableDelta, unusableDelta));
    setStaggerFrom(baseline.read + baseline.unusable);
    if (readDelta > 0) {
      const color =
        arrivalKind === "single" ? HONEYCOMB_COLORS[(((arrivalFinished - 1) % 4) + 4) % 4]! : "#2F6FE4";
      setCountPulse({ id: arrivalSeq, color });
      setChip({ id: arrivalSeq, label: `+${readDelta}` });
    }
  }, [active, arrivalFinished, arrivalKind, arrivalSeq, counterRead, counterUnusable]);

  useEffect(() => {
    const crossed = readingDone && !readingDoneSeenRef.current;
    readingDoneSeenRef.current = readingDone;
    if (crossed && active) {
      setLiveMessage(SYNC_MESSAGE);
    }
  }, [active, readingDone]);

  useEffect(() => {
    if (!countPulse) {
      return;
    }
    const timer = window.setTimeout(() => setCountPulse(null), COUNT_PULSE_MS);
    return () => window.clearTimeout(timer);
  }, [countPulse]);

  useEffect(() => {
    if (!chip) {
      return;
    }
    const timer = window.setTimeout(() => setChip(null), reducedMotion ? CHIP_REDUCED_MS : CHIP_MS);
    return () => window.clearTimeout(timer);
  }, [chip, reducedMotion]);

  const copy = livingHiveCopy(run, counter, documentCount);
  const steps = studyProgressSteps(maxStageRef.current, run);
  const currentStep = steps.find((step) => step.state === "active");
  const questionLine = studyRunQuestionLine(run, questionCount);
  const activityIso = latestActivityIso(run.updated_at, readingProgressObservedAt);
  const stale = active && pollState === "ok" && isStudyRunUpdateStale(activityIso, nowMs);
  const succeeded = run.status === StudyRunStatus.SUCCEEDED;
  const stopped = run.status === StudyRunStatus.FAILED || run.status === StudyRunStatus.CANCELLED;

  let live = "";
  if (succeeded) {
    live = "Done.";
  } else if (active) {
    live = liveMessage ?? (reducedMotion && currentStep ? `Working: ${currentStep.label.toLowerCase()}.` : "");
  }

  const segmentColor = stopped ? "#AEB5BF" : succeeded || readingDone ? "#2FA35A" : "#2F6FE4";
  const segments = counter
    ? Array.from({ length: counter.total }, (_, index) => {
        const finished = counter.read + counter.unusable;
        const on = index < finished;
        const fresh = on && staggerFrom != null && index >= staggerFrom;
        return {
          width: on ? "100%" : "0%",
          background: index < counter.read ? segmentColor : "#AEB5BF",
          delay: fresh ? `${(index - staggerFrom) * SEGMENT_STAGGER_MS}ms` : "0ms",
        };
      })
    : [];

  const names = documentNames ?? [];
  const docsSummary = counter
    ? `${counter.read} of ${counter.total} read`
    : `${names.length} document${names.length === 1 ? "" : "s"}`;

  let footer: React.ReactNode;
  if (succeeded) {
    footer = (
      <>
        <button type="button" className={SECONDARY} onClick={onMinimize}>
          Close
        </button>
        <button type="button" className={PRIMARY} onClick={onViewResults} data-testid="progress-view-results">
          View results
        </button>
      </>
    );
  } else if (stopped) {
    footer = (
      <>
        <button type="button" className={SECONDARY} onClick={onMinimize} data-testid="progress-back">
          Back to my Hive
        </button>
        {onRetry ? (
          <button
            type="button"
            className={PRIMARY_COMPACT}
            disabled={retryBusy}
            onClick={() => {
              setRetryRequested(true);
              onRetry();
            }}
            data-testid="progress-retry"
          >
            {retryBusy ? "Starting…" : "Try again"}
          </button>
        ) : null}
      </>
    );
  } else {
    footer = (
      <>
        <span className="min-w-[200px] flex-1 self-center text-[13.5px] leading-[1.45] text-[#6B7280]">
          You can close this. HiveForYou keeps working.
        </span>
        <button type="button" className={SECONDARY} onClick={onMinimize} data-testid="progress-minimize">
          Run in background
        </button>
      </>
    );
  }

  const failHelp =
    counterUnusable > 0
      ? "Try again first. If it still doesn't work, upload a clearer scan or the original PDF from your Hive."
      : "Try again. Your documents are still in your Hive.";

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center"
      data-testid="hive-progress-overlay"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[#1F2328]/45"
        aria-label="Minimize progress"
        onClick={onMinimize}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative z-[71] flex max-h-[92vh] w-full max-w-[520px] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_24px_64px_rgba(31,35,40,0.18)] outline-none sm:rounded-[24px]"
        data-testid="hive-progress-modal"
      >
        <div className="flex flex-col gap-[22px] overflow-y-auto px-5 py-6 sm:px-9 sm:py-8 [&>*]:shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#6B7280]">{hiveName ?? ""}</span>
            {reducedMotion ? (
              <span
                className="inline-flex h-[26px] items-center rounded-full bg-[#F1F3F6] px-2.5 text-[12.5px] font-semibold text-[#4A525C]"
                data-testid="progress-motion-reduced"
              >
                Motion reduced
              </span>
            ) : null}
          </div>

          <div className="flex justify-center py-1">
            <div className="h-[168px] w-[168px] sm:h-[208px] sm:w-[208px]">
              <HoneycombActivity
                mode={honeycombMode(run.status)}
                arrival={arrival}
                readingDone={readingDone}
                reducedMotion={reducedMotion}
                className="h-full w-full"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h2
              id={titleId}
              className="m-0 font-brand text-[30px] font-semibold leading-[1.15] tracking-[-0.02em] text-[#1F2328] sm:text-[32px]"
            >
              {copy.title}
            </h2>
            <p className="m-0 text-base leading-[1.55] text-[#4A525C]" data-testid="progress-sub">
              {copy.sub}
            </p>
            {questionLine ? (
              <p className="m-0 text-sm text-[#6B7280]" data-testid="progress-questions">
                {questionLine}
              </p>
            ) : null}
          </div>
          <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="progress-announce">
            {copy.title}
          </p>

          {counter ? (
            <div className="flex flex-col gap-3" data-testid="progress-counter">
              <div className="flex flex-wrap items-baseline gap-2.5">
                <span
                  key={countPulse ? `count-${countPulse.id}` : "count"}
                  className={`hfy-lh-count font-brand text-[44px] font-semibold leading-none tracking-[-0.03em] text-[#1F2328]${
                    countPulse && !reducedMotion ? " hfy-lh-count--pulse" : ""
                  }`}
                  style={countPulse ? ({ "--lh-pulse": countPulse.color } as CSSProperties) : undefined}
                  data-testid="progress-count"
                >
                  {counter.read}
                </span>
                <span className="text-lg font-medium text-[#4A525C]">
                  of {counter.total} document{counter.total === 1 ? "" : "s"} read
                </span>
                {chip ? (
                  <span
                    key={`chip-${chip.id}`}
                    className={`inline-flex h-[26px] items-center rounded-full bg-[#EAF6EE] px-2.5 text-[13px] font-bold text-[#1E7A41]${
                      reducedMotion ? "" : " hfy-lh-chip--show"
                    }`}
                    aria-hidden
                    data-testid="progress-chip"
                  >
                    {chip.label}
                  </span>
                ) : null}
              </div>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={counter.total}
                aria-valuenow={counter.read}
                aria-label="Documents read"
                className="grid"
                style={{
                  gridTemplateColumns: `repeat(${counter.total}, minmax(0, 1fr))`,
                  gap: counter.total > 16 ? 3 : 5,
                }}
                data-testid="progress-segments"
              >
                {segments.map((segment, index) => (
                  <span key={index} className="relative h-2 overflow-hidden rounded-[4px] bg-[#EDEFF2]">
                    <span
                      className="absolute inset-y-0 left-0 rounded-[4px]"
                      style={{
                        width: segment.width,
                        background: segment.background,
                        transition: reducedMotion
                          ? "none"
                          : `width .5s cubic-bezier(.2,.7,.2,1) ${segment.delay}, background .6s`,
                      }}
                      data-testid="progress-segment"
                      data-on={segment.width === "100%" ? "true" : "false"}
                    />
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div
            aria-live="polite"
            className="min-h-[22px] text-[14.5px] font-medium leading-[1.5] text-[#1E7A41]"
            data-testid="progress-live"
          >
            {live}
          </div>

          {pollState === "auth_expired" ? (
            <p className="m-0 rounded-[10px] bg-[#FEF5E1] px-3 py-2 text-sm text-[#6B4600]" role="status">
              Your session expired. Sign in again to see live updates. Your analysis continues on our servers.
            </p>
          ) : null}
          {pollState === "reconnecting" ? (
            <p className="m-0 rounded-[10px] bg-[#FEF5E1] px-3 py-2 text-sm text-[#6B4600]" role="status">
              We're having trouble reaching HiveForYou. We'll keep trying — your analysis continues on our servers.
            </p>
          ) : null}
          {stale ? (
            <p className="m-0 rounded-[10px] bg-[#F5F8FF] px-3 py-2 text-sm text-[#1F2328]" role="status">
              {studyRunStaleNotice(run.stage)}
            </p>
          ) : null}

          <ol
            className="m-0 grid list-none grid-cols-2 gap-2 border-t border-[#EEF0F3] p-0 pt-1 sm:grid-cols-3"
            data-testid="progress-steps"
          >
            {steps.map((step) => {
              const bar =
                step.state === "done"
                  ? "#2FA35A"
                  : step.state === "active"
                    ? "#2F6FE4"
                    : step.state === "stopped"
                      ? "#AEB5BF"
                      : "#E6E9ED";
              const emphasized = step.state === "active" || step.state === "stopped";
              return (
                <li
                  key={step.label}
                  className="flex flex-col gap-1.5 pt-3"
                  aria-current={step.state === "active" ? "step" : undefined}
                  data-state={step.state}
                >
                  <span className="h-[3px] rounded-[2px]" style={{ background: bar }} aria-hidden />
                  <span
                    className={`text-[13px] leading-[1.3] ${emphasized ? "font-semibold" : "font-medium"} ${
                      step.state === "pending" ? "text-[#9AA3AE]" : "text-[#1F2328]"
                    }`}
                  >
                    {step.label}
                    <span className="sr-only">
                      {step.state === "done"
                        ? " (done)"
                        : step.state === "active"
                          ? " (in progress)"
                          : step.state === "stopped"
                            ? " (stopped)"
                            : ""}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>

          {documentNames && names.length > 0 ? (
            <div className="flex flex-col overflow-hidden rounded-[14px] border border-[#E7E9ED]">
              <button
                type="button"
                className="flex min-h-[46px] items-center gap-2.5 border-none bg-white px-4 text-left text-[14.5px] font-semibold text-[#1F2328] hover:bg-[#FAFBFC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#3B7CF6]"
                aria-expanded={docsOpen}
                aria-controls={docsListId}
                onClick={() => setDocsOpen((open) => !open)}
                data-testid="progress-docs-toggle"
              >
                <span className="flex-1">Documents</span>
                <span className="text-[13.5px] font-medium text-[#6B7280]" data-testid="progress-docs-summary">
                  {docsSummary}
                </span>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#6B7280"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  style={{ transform: docsOpen ? "rotate(180deg)" : "none", transition: reducedMotion ? "none" : "transform .2s" }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {docsOpen ? (
                <ul
                  id={docsListId}
                  className="m-0 flex max-h-[300px] list-none flex-col overflow-auto border-t border-[#EEF0F3] p-0"
                  data-testid="progress-docs"
                >
                  {names.map((name, index) => (
                    <li
                      key={`${index}-${name}`}
                      className="flex items-center gap-3 border-b border-[#F3F4F6] px-4 py-2.5 last:border-b-0"
                    >
                      <span className="h-[9px] w-[9px] flex-none rounded-full bg-[#D9DDE3]" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium text-[#1F2328]" title={name}>
                        {name}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {run.status === StudyRunStatus.FAILED && run.error_message_safe ? (
            <p className="m-0 text-sm text-[#4A525C]" role="alert" data-testid="progress-error">
              {run.error_message_safe}
            </p>
          ) : null}
          {stopped ? (
            <div className="flex flex-col gap-1.5 rounded-[12px] bg-[#F4F5F7] px-4 py-3.5" data-testid="progress-help">
              <span className="text-[14.5px] font-semibold text-[#1F2328]">What you can do</span>
              <span className="text-[14.5px] leading-[1.55] text-[#4A525C]">
                {onRetry ? failHelp : "Go back to your Hive to check your question and documents."}
              </span>
            </div>
          ) : null}
          {stopped && retryRequested && retryError ? (
            <p className="m-0 text-sm text-[#B42318]" role="alert" data-testid="progress-retry-error">
              {retryError}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2.5">{footer}</div>
        </div>
      </div>
    </div>
  );
}
