"use client";

import { StudyRunStatus } from "@hiveforyou/contracts/errors/v1";
import type { StudyRunSafeV1 } from "@hiveforyou/contracts/study-runs/v1";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";

import { type HoneycombArrival, HoneycombActivity } from "@/components/workspace/HoneycombActivity";
import { handleModalTabKeyDown, safeReturnFocus } from "@/lib/a11y/modal-focus";
import { brand } from "@/lib/brand/paths";
import {
  buildStudyProgressChecklist,
  formatTimeSinceUpdate,
  type HiveProgressPollState,
  isReadingStageComplete,
  isStudyRunUpdateStale,
  isTerminalStudyRunStatus,
  latestActivityIso,
  mergeMonotonicStageIndex,
  type ReadingProgressCounts,
  studyRunDocumentTotalLine,
  studyRunQuestionLine,
  studyRunReadingProgressLine,
  studyRunStageDetail,
  studyRunStaleNotice,
  studyRunSummaryText,
} from "@/lib/study-runs/handoff";

export type { HiveProgressPollState };

type HiveProgressModalProps = {
  open: boolean;
  run: StudyRunSafeV1 | null;
  documentCount: number | null;
  questionCount?: number | null;
  readingProgress?: ReadingProgressCounts | null;
  readingProgressObservedAt?: number | null;
  readingArrival?: (HoneycombArrival & { runId: string }) | null;
  pollState: HiveProgressPollState;
  lastPollSuccessAt: number | null;
  returnFocusRef: React.RefObject<HTMLElement | null>;
  onMinimize: () => void;
  onViewResults: () => void;
};

const PRIMARY =
  "inline-flex h-11 items-center justify-center rounded-[11px] bg-[#2F6FE4] px-5 text-sm font-semibold text-white hover:bg-[#2456B8]";
const SECONDARY =
  "inline-flex h-11 items-center justify-center rounded-[11px] border border-[#D9DDE3] bg-white px-5 text-sm font-semibold text-[#1F2328] hover:bg-[#F4F6F8]";

export function HiveProgressModal({
  open,
  run,
  documentCount,
  questionCount = null,
  readingProgress = null,
  readingProgressObservedAt = null,
  readingArrival = null,
  pollState,
  lastPollSuccessAt,
  returnFocusRef,
  onMinimize,
  onViewResults,
}: HiveProgressModalProps) {
  const titleId = useId();
  const liveId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const maxStageRef = useRef<{ runId: string | null; index: number }>({ runId: null, index: -1 });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [headlineAnnounced, setHeadlineAnnounced] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    const tick = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(tick);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    dialogRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
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
  }, [onMinimize, open, returnFocusRef]);

  const headline =
    open && run ? (studyRunSummaryText(run, documentCount) ?? "Working on your analysis…") : "";
  const readingLine = open && run ? studyRunReadingProgressLine(run, readingProgress) : null;
  const announcement = readingLine ? `${headline} ${readingLine}` : headline;

  useEffect(() => {
    if (announcement && announcement !== headlineAnnounced) {
      setHeadlineAnnounced(announcement);
    }
  }, [announcement, headlineAnnounced]);

  if (!open || !run) {
    return null;
  }

  if (maxStageRef.current.runId !== run.id) {
    maxStageRef.current = { runId: run.id, index: -1 };
  }
  maxStageRef.current.index = mergeMonotonicStageIndex(maxStageRef.current.index, run.stage);

  const terminal = isTerminalStudyRunStatus(run.status);
  const active = !terminal;
  const docLine = studyRunDocumentTotalLine(documentCount);
  const stageDetail = studyRunStageDetail(run);
  const questionLine = studyRunQuestionLine(run, questionCount);
  const activityIso = latestActivityIso(run.updated_at, readingProgressObservedAt);
  const lastUpdate = formatTimeSinceUpdate(activityIso, nowMs);
  const stale =
    active &&
    pollState === "ok" &&
    isStudyRunUpdateStale(activityIso, nowMs);
  const checklist = buildStudyProgressChecklist(maxStageRef.current.index, run);
  const showHoneycomb = run.status !== StudyRunStatus.QUEUED;
  const arrival = readingArrival && readingArrival.runId === run.id ? readingArrival : null;

  let footer: React.ReactNode;
  if (run.status === StudyRunStatus.SUCCEEDED) {
    footer = (
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className={PRIMARY} onClick={onViewResults} data-testid="progress-view-results">
          View results
        </button>
        <button type="button" className={SECONDARY} onClick={onMinimize}>
          Close
        </button>
      </div>
    );
  } else if (run.status === StudyRunStatus.FAILED) {
    footer = (
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className={SECONDARY} onClick={onMinimize}>
          Close
        </button>
      </div>
    );
  } else if (run.status === StudyRunStatus.CANCELLED) {
    footer = (
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className={SECONDARY} onClick={onMinimize}>
          Close
        </button>
      </div>
    );
  } else {
    footer = (
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className={SECONDARY} onClick={onMinimize} data-testid="progress-minimize">
          Minimize
        </button>
      </div>
    );
  }

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
        className="relative z-[71] flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-[18px] border border-[#E7E9ED] bg-white shadow-[0_24px_48px_rgba(31,35,40,0.2)] outline-none"
        data-testid="hive-progress-modal"
      >
        <div className="overflow-y-auto px-6 pb-6 pt-6 sm:px-8 sm:pb-8 sm:pt-8">
          <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left">
            <div className="relative h-[88px] w-[132px] shrink-0 sm:mr-5">
              {showHoneycomb ? (
                <HoneycombActivity
                  key={run.id}
                  active={active}
                  arrival={arrival}
                  readingDone={isReadingStageComplete(maxStageRef.current.index)}
                  className="h-[88px] w-[132px]"
                />
              ) : (
                <Image
                  src={brand.mark}
                  alt=""
                  width={64}
                  height={64}
                  className="mx-auto h-16 w-16 sm:mx-0"
                />
              )}
            </div>
            <div className="mt-4 min-w-0 flex-1 sm:mt-0">
              <h2 id={titleId} className="m-0 font-brand text-xl font-semibold text-[#1F2328] sm:text-[22px]">
                {terminal && run.status === StudyRunStatus.SUCCEEDED
                  ? "Analysis complete"
                  : terminal && run.status === StudyRunStatus.FAILED
                    ? "Analysis didn't finish"
                    : terminal && run.status === StudyRunStatus.CANCELLED
                      ? "Analysis stopped"
                      : "Building your Hive"}
              </h2>
              <p className="mt-2 m-0 text-[15px] font-medium leading-snug text-[#1F2328]" data-testid="progress-headline">
                {headline}
              </p>
              {readingLine ? (
                <p className="mt-1 m-0 text-sm font-medium text-[#1F2328]" data-testid="progress-reading">
                  {readingLine}
                </p>
              ) : null}
              {stageDetail ? (
                <p className="mt-1 m-0 text-sm text-[#4A525C]" data-testid="progress-stage-detail">
                  {stageDetail}
                </p>
              ) : null}
              {questionLine ? (
                <p className="mt-1 m-0 text-sm text-[#4A525C]" data-testid="progress-questions">
                  {questionLine}
                </p>
              ) : null}
              {docLine ? (
                <p className="mt-1 m-0 text-sm text-[#6B7280]" data-testid="progress-document-total">
                  {docLine}
                </p>
              ) : null}
              {lastUpdate && active ? (
                <p className="mt-1 m-0 text-xs text-[#6B7280]" data-testid="progress-last-update">
                  {lastUpdate}
                </p>
              ) : null}
            </div>
          </div>

          <p id={liveId} className="sr-only" aria-live="polite" aria-atomic="true">
            {headlineAnnounced}
          </p>

          {pollState === "auth_expired" ? (
            <p className="mt-4 rounded-[10px] bg-[#FEF5E1] px-3 py-2 text-sm text-[#6B4600]" role="status">
              Your session expired. Sign in again to see live updates. Your analysis continues on our servers.
            </p>
          ) : null}
          {pollState === "reconnecting" ? (
            <p className="mt-4 rounded-[10px] bg-[#FEF5E1] px-3 py-2 text-sm text-[#6B4600]" role="status">
              We're having trouble reaching HiveForYou. We'll keep trying — your analysis continues on our servers.
            </p>
          ) : null}
          {stale ? (
            <p className="mt-4 rounded-[10px] bg-[#F5F8FF] px-3 py-2 text-sm text-[#1F2328]" role="status">
              {studyRunStaleNotice(run.stage)}
            </p>
          ) : null}
          {run.status === StudyRunStatus.FAILED && run.error_message_safe ? (
            <p className="mt-4 text-sm text-[#B42318]" role="alert">
              {run.error_message_safe}
            </p>
          ) : null}
          {run.status === StudyRunStatus.SUCCEEDED ? (
            <p className="mt-4 text-sm leading-relaxed text-[#4A525C]">
              Your documents have been read. Nothing here is a verified finding yet — your Canonical Study is assembled
              in a later step.
            </p>
          ) : null}
          {run.status === StudyRunStatus.CANCELLED ? (
            <p className="mt-4 text-sm text-[#4A525C]">Your last analysis was stopped. You can try again from Documents.</p>
          ) : null}

          {active ? (
            <ul className="mt-6 mb-0 list-none space-y-3 p-0" data-testid="progress-checklist">
              {checklist.map((item) => (
                <li key={item.label} className="flex items-center gap-3 text-sm">
                  {item.state === "done" ? (
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2FA35A] text-white"
                      aria-hidden
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                        <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  ) : item.state === "active" ? (
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-[#2F6FE4]"
                      aria-hidden
                    >
                      <span className="h-2 w-2 rounded-full bg-[#2F6FE4] motion-safe:animate-pulse" />
                    </span>
                  ) : (
                    <span className="h-5 w-5 shrink-0 rounded-full border-2 border-[#D9DDE3]" aria-hidden />
                  )}
                  <span
                    className={
                      item.state === "pending"
                        ? "text-[#9AA3AE]"
                        : item.state === "active"
                          ? "font-semibold text-[#1F2328]"
                          : "text-[#1F2328]"
                    }
                  >
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {active && lastPollSuccessAt != null ? (
            <p className="mt-4 m-0 text-xs text-[#9AA3AE]">
              You can leave this page — we'll keep working.
            </p>
          ) : null}

          {footer}
        </div>
      </div>
    </div>
  );
}
