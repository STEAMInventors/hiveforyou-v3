import { StudyRunStatus } from "@hiveforyou/contracts/errors/v1";
import { clarificationJsonForDomainHint } from "@hiveforyou/contracts/study-runs/v1";
import type { StudyIntentClarificationV1 } from "@hiveforyou/contracts/study-runs/v1";

const TERMINAL = new Set<string>([
  StudyRunStatus.SUCCEEDED,
  StudyRunStatus.FAILED,
  StudyRunStatus.CANCELLED,
]);

export function isTerminalStudyRunStatus(status: string | null | undefined): boolean {
  return status != null && TERMINAL.has(status);
}

/** Re-send the Inngest event when a delivery retry finds a run that never reached a terminal status. */
export function shouldEnqueueStudyRun(idempotentReplay: boolean, status: string): boolean {
  if (!idempotentReplay) {
    return true;
  }
  return !isTerminalStudyRunStatus(status);
}

export type DisplayedIntent = {
  rawIntent: string;
  selectedDomainId: string | null;
  locked: boolean;
};

export function resolveDisplayedIntent(input: {
  local: { rawIntent: string; selectedDomainId: string | null } | null;
  server: {
    intentRequestText: string | null;
    domainHint: string | null;
    runStatus: string | null;
  } | null;
}): DisplayedIntent {
  const status = input.server?.runStatus ?? null;
  const locked = status != null && !isTerminalStudyRunStatus(status);
  if (locked && input.server?.intentRequestText) {
    return {
      rawIntent: input.server.intentRequestText,
      selectedDomainId: input.server.domainHint,
      locked: true,
    };
  }
  const local = input.local;
  if (local && (local.rawIntent.trim() || local.selectedDomainId)) {
    return {
      rawIntent: local.rawIntent,
      selectedDomainId: local.selectedDomainId,
      locked,
    };
  }
  if (input.server?.intentRequestText) {
    return {
      rawIntent: input.server.intentRequestText,
      selectedDomainId: input.server.domainHint,
      locked,
    };
  }
  return {
    rawIntent: local?.rawIntent ?? "",
    selectedDomainId: local?.selectedDomainId ?? null,
    locked,
  };
}

/** The first-page question to submit. Blank text is missing intent, not a default question. */
export function capturedQuestionForAnalyze(requestText: string | null | undefined): string | null {
  const trimmed = requestText?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export const ANALYZE_MISSING_QUESTION_MESSAGE =
  "Describe what you want this study to answer.";

export function studyDomainHintLabel(
  domainId: string | null,
  resolveShortLabel: (id: string) => string | undefined,
): string {
  if (!domainId) {
    return "No domain";
  }
  return resolveShortLabel(domainId) ?? domainId;
}

export type ContinueAction =
  | { kind: "start" }
  | { kind: "view_progress" }
  | { kind: "view_results"; canAnalyzeChanges: boolean }
  | { kind: "retry" }
  | { kind: "disabled"; reason: string };

/**
 * Only `start`, `retry` and `view_results.canAnalyzeChanges` may submit a run; a succeeded
 * run with no question or document change must never be reprocessed from Continue.
 */
export function continueAction(input: {
  runStatus: string | null;
  requestText: string;
  questionChanged: boolean;
  newDocumentCount: number;
  readyDocumentCount: number;
  uploadingCount: number;
  busy: boolean;
}): ContinueAction {
  if (input.busy) {
    return { kind: "disabled", reason: "Starting your analysis…" };
  }
  if (input.runStatus != null && !isTerminalStudyRunStatus(input.runStatus)) {
    return { kind: "view_progress" };
  }
  const hasQuestion = capturedQuestionForAnalyze(input.requestText) != null;
  const canSubmit =
    hasQuestion && input.readyDocumentCount > 0 && input.uploadingCount === 0;
  if (input.runStatus === StudyRunStatus.SUCCEEDED) {
    return {
      kind: "view_results",
      canAnalyzeChanges: canSubmit && (input.questionChanged || input.newDocumentCount > 0),
    };
  }
  if (!hasQuestion) {
    return { kind: "disabled", reason: "Add your question to continue." };
  }
  if (input.uploadingCount > 0) {
    return { kind: "disabled", reason: "Wait for uploads to finish." };
  }
  if (input.readyDocumentCount === 0) {
    return { kind: "disabled", reason: "Add at least one document to continue." };
  }
  return input.runStatus == null ? { kind: "start" } : { kind: "retry" };
}

/** Same comparison as the submit body, so whitespace-only edits are not a change. */
export function isQuestionChanged(input: {
  requestText: string;
  domainId: string | null;
  lastRequestText: string | null;
  lastDomainId: string | null;
}): boolean {
  if (input.lastRequestText == null) {
    return false;
  }
  return (
    capturedQuestionForAnalyze(input.requestText) !==
      capturedQuestionForAnalyze(input.lastRequestText) ||
    (input.domainId ?? null) !== (input.lastDomainId ?? null)
  );
}

type RegisteredTimestamped = { status: string; registered_at: string | null };

/** Registered documents split around the run's creation, matching the submit RPC's count. */
export function runDocumentCounts(
  documents: readonly RegisteredTimestamped[],
  runCreatedAt: string | null,
): { included: number; addedSince: number } {
  const runTime = runCreatedAt ? Date.parse(runCreatedAt) : Number.NaN;
  let included = 0;
  let addedSince = 0;
  for (const doc of documents) {
    if (doc.status !== "registered" || !doc.registered_at) {
      continue;
    }
    if (Number.isNaN(runTime) || Date.parse(doc.registered_at) <= runTime) {
      included += 1;
    } else {
      addedSince += 1;
    }
  }
  return { included, addedSince };
}

function documentsPhrase(count: number | null): string {
  if (count == null || count <= 0) {
    return "your documents";
  }
  return `your ${count} document${count === 1 ? "" : "s"}`;
}

/** No durable `updated_at` change for this long → nonterminal “still checking” copy. */
export const STUDY_RUN_STALE_UPDATE_MS = 4 * 60 * 1000;

export type HiveProgressPollState = "ok" | "reconnecting" | "auth_expired";

/** Customer-visible stages for the progress modal (P1.5 path only — no verify/merge/report). */
export const STUDY_PROGRESS_CHECKLIST = [
  { stage: "enqueue", label: "Getting started" },
  { stage: "plan_questions", label: "Understanding your question" },
  { stage: "load_sources", label: "Gathering your documents" },
  { stage: "plan_schema", label: "Identifying document types" },
  { stage: "extract", label: "Reading your documents" },
  { stage: "finalize", label: "Finishing up" },
] as const;

const STAGE_ORDER = new Map<string, number>(
  STUDY_PROGRESS_CHECKLIST.map((row, index) => [row.stage, index]),
);

export function studyProgressStageIndex(stage: string): number {
  return STAGE_ORDER.get(stage) ?? -1;
}

/** Never move the visible checklist backward when Inngest retries an earlier stage. */
export function mergeMonotonicStageIndex(currentMax: number, stage: string): number {
  const index = studyProgressStageIndex(stage);
  if (index < 0) {
    return currentMax;
  }
  return Math.max(currentMax, index);
}

export type StudyProgressChecklistItem = {
  label: string;
  state: "done" | "active" | "pending";
};

export function buildStudyProgressChecklist(
  maxStageIndex: number,
  run: { status: string; stage: string },
): StudyProgressChecklistItem[] {
  if (run.status === StudyRunStatus.SUCCEEDED) {
    return STUDY_PROGRESS_CHECKLIST.map((row) => ({ label: row.label, state: "done" }));
  }
  const rawIndex = studyProgressStageIndex(run.stage);
  const activeIndex = rawIndex >= 0 ? Math.max(maxStageIndex, rawIndex) : maxStageIndex;

  return STUDY_PROGRESS_CHECKLIST.map((row, index) => {
    if (index < activeIndex) {
      return { label: row.label, state: "done" as const };
    }
    if (index === activeIndex && !isTerminalStudyRunStatus(run.status)) {
      return { label: row.label, state: "active" as const };
    }
    return { label: row.label, state: "pending" as const };
  });
}

export function isStudyRunUpdateStale(updatedAtIso: string | null | undefined, nowMs: number): boolean {
  if (!updatedAtIso) {
    return false;
  }
  const updatedMs = Date.parse(updatedAtIso);
  if (Number.isNaN(updatedMs)) {
    return false;
  }
  return nowMs - updatedMs >= STUDY_RUN_STALE_UPDATE_MS;
}

export function formatTimeSinceUpdate(updatedAtIso: string | null | undefined, nowMs: number): string | null {
  if (!updatedAtIso) {
    return null;
  }
  const updatedMs = Date.parse(updatedAtIso);
  if (Number.isNaN(updatedMs)) {
    return null;
  }
  const deltaSec = Math.max(0, Math.floor((nowMs - updatedMs) / 1000));
  if (deltaSec < 45) {
    return "Last update just now";
  }
  const deltaMin = Math.floor(deltaSec / 60);
  if (deltaMin < 60) {
    return `Last update ${deltaMin} minute${deltaMin === 1 ? "" : "s"} ago`;
  }
  const deltaHr = Math.floor(deltaMin / 60);
  return `Last update ${deltaHr} hour${deltaHr === 1 ? "" : "s"} ago`;
}

/** What the current stage is doing; describes the stage only, never timing or completion. */
export function studyRunStageDetail(run: { status: string; stage: string } | null): string | null {
  if (!run || isTerminalStudyRunStatus(run.status) || run.status === StudyRunStatus.QUEUED) {
    return null;
  }
  switch (run.stage) {
    case "plan_questions":
      return "Working out what to look for in your documents.";
    case "load_sources":
      return "Collecting the documents included in this analysis.";
    case "plan_schema":
      return "Preparing to recognize each type of document.";
    case "extract":
      return "Each document is read page by page. Long documents can take several minutes.";
    default:
      return null;
  }
}

/** Shown once the question set is recorded (stages after `plan_questions`). */
export function studyRunQuestionLine(
  run: { status: string; stage: string } | null,
  questionCount: number | null | undefined,
): string | null {
  if (!run || isTerminalStudyRunStatus(run.status) || !questionCount || questionCount <= 0) {
    return null;
  }
  if (studyProgressStageIndex(run.stage) <= studyProgressStageIndex("plan_questions")) {
    return null;
  }
  return `We'll look for answers to ${questionCount} question${questionCount === 1 ? "" : "s"}.`;
}

export type ReadingProgressCounts = {
  documents_total: number | null;
  documents_finished: number;
  documents_unusable: number;
};

/** Only durable "document finished" markers count; nothing is shown before the first one. */
export function studyRunReadingProgressLine(
  run: { status: string; stage: string } | null,
  progress: ReadingProgressCounts | null,
): string | null {
  if (!run || isTerminalStudyRunStatus(run.status) || run.stage !== "extract" || !progress) {
    return null;
  }
  const finished = progress.documents_finished;
  if (finished <= 0) {
    return null;
  }
  const total = progress.documents_total;
  const base =
    total != null && total > 0
      ? `Finished reading ${finished} of ${total} document${total === 1 ? "" : "s"}.`
      : `Finished reading ${finished} document${finished === 1 ? "" : "s"}.`;
  const unusable = progress.documents_unusable;
  if (unusable <= 0) {
    return base;
  }
  return `${base} ${unusable} couldn't be read.`;
}

/** Keeps the highest finished count seen for a run so retries never move the line backward. */
export function mergeMonotonicReadingProgress<T extends ReadingProgressCounts>(
  previous: T | null,
  next: T,
): T {
  if (!previous || next.documents_finished >= previous.documents_finished) {
    return next;
  }
  return previous;
}

export type ReadingArrivalKind = "single" | "batch";

/**
 * A newly observed increase in finished documents. Only an uninterrupted observation with a prior
 * count qualifies; first load, reopen and reconnect only set the baseline.
 */
export function classifyReadingArrival(input: {
  previousFinished: number | null;
  nextFinished: number;
  continuous: boolean;
}): { kind: ReadingArrivalKind; count: number } | null {
  const { previousFinished, nextFinished, continuous } = input;
  if (!continuous || previousFinished == null || nextFinished <= previousFinished) {
    return null;
  }
  const count = nextFinished - previousFinished;
  return { kind: count === 1 ? "single" : "batch", count };
}

/** True once the monotonic checklist has moved past reading. */
export function isReadingStageComplete(maxStageIndex: number): boolean {
  return maxStageIndex > studyProgressStageIndex("extract");
}

/**
 * Status polls can resolve out of order. A response older than the latest settled poll is `stale`
 * and ignored entirely. A fresh response is applied unless it belongs to another run or would move a
 * finished run back to an active one (`keep_current`).
 */
export function studyRunStatusDecision(input: {
  requestSeq: number;
  latestSettledSeq: number;
  current: { id: string; status: string } | null;
  next: { id: string; status: string };
}): "stale" | "keep_current" | "apply" {
  const { requestSeq, latestSettledSeq, current, next } = input;
  if (requestSeq <= latestSettledSeq) {
    return "stale";
  }
  if (current && current.id !== next.id) {
    return "keep_current";
  }
  if (current && isTerminalStudyRunStatus(current.status) && !isTerminalStudyRunStatus(next.status)) {
    return "keep_current";
  }
  return "apply";
}

export function studyRunStaleNotice(stage: string): string {
  if (stage === "extract") {
    return "Reading can take several minutes per document. We haven't recorded a new update in a few minutes — we're still checking.";
  }
  return "We haven't recorded a new update in a few minutes. We're still checking.";
}

/** Latest durable activity: the run row's `updated_at` or when a newly finished document was observed. */
export function latestActivityIso(
  updatedAtIso: string | null | undefined,
  progressObservedAtMs: number | null,
): string | null {
  const updatedMs = updatedAtIso ? Date.parse(updatedAtIso) : Number.NaN;
  if (progressObservedAtMs == null) {
    return updatedAtIso ?? null;
  }
  if (Number.isNaN(updatedMs) || progressObservedAtMs > updatedMs) {
    return new Date(progressObservedAtMs).toISOString();
  }
  return updatedAtIso ?? null;
}

export function studyRunDocumentTotalLine(documentCount: number | null): string | null {
  if (documentCount == null || documentCount <= 0) {
    return null;
  }
  return `${documentCount} document${documentCount === 1 ? "" : "s"} in this analysis`;
}

/** Customer-facing run summary; never exposes run ids, raw stages or correlation ids. */
export function studyRunSummaryText(
  run: { status: string; stage: string } | null,
  documentCount: number | null,
): string | null {
  if (!run) {
    return null;
  }
  const docs = documentsPhrase(documentCount);
  switch (run.status) {
    case StudyRunStatus.SUCCEEDED:
      return `Analysis finished. We read ${docs}.`;
    case StudyRunStatus.FAILED:
      return "Your last analysis didn't finish.";
    case StudyRunStatus.CANCELLED:
      return "Your last analysis was stopped.";
    default:
      break;
  }
  switch (run.stage) {
    case "enqueue":
      return "Getting started…";
    case "plan_questions":
      return "Understanding your question…";
    case "load_sources":
      return `Gathering ${docs}…`;
    case "plan_schema":
      return `Identifying types in ${docs}…`;
    case "extract":
      return `Reading ${docs}…`;
    default:
      return `Working on ${docs}…`;
  }
}

export function intentSignature(requestText: string, domainId: string | null): string {
  return `${domainId ?? ""}\n${requestText}`;
}

export function nextDeliveryKey(input: {
  previous: { key: string; signature: string } | null;
  signature: string;
  reusePrevious: boolean;
  createKey: () => string;
}): { key: string; signature: string } {
  if (
    input.reusePrevious &&
    input.previous &&
    input.previous.signature === input.signature &&
    input.previous.key
  ) {
    return input.previous;
  }
  return { key: input.createKey(), signature: input.signature };
}

export function buildAnalyzeSubmitBody(input: {
  requestText: string;
  domainId: string | null;
  idempotencyKey: string;
}): {
  request_text: string;
  trigger: "study";
  idempotency_key: string;
  clarification_json: StudyIntentClarificationV1 | null;
} {
  return {
    request_text: input.requestText.trim(),
    trigger: "study",
    idempotency_key: input.idempotencyKey,
    clarification_json: clarificationJsonForDomainHint(input.domainId),
  };
}
