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

/** Analyze is allowed only with a nonempty question and no active submit or in-flight run. */
export function isAnalyzeDocumentsEnabled(input: {
  requestText: string;
  busy: boolean;
  intentLocked: boolean;
  runInProgress: boolean;
}): boolean {
  if (input.busy || input.intentLocked || input.runInProgress) {
    return false;
  }
  return capturedQuestionForAnalyze(input.requestText) != null;
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
