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
