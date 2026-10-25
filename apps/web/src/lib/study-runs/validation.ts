import {
  clarificationJsonForDomainHint,
  type StudyIntentClarificationV1,
  type StudyRunTriggerV1,
} from "@hiveforyou/contracts/study-runs/v1";

import { getPublicDomainPack } from "@/lib/domain-packs/public-metadata";

const TRIGGERS: StudyRunTriggerV1[] = ["generate", "reprocess", "study"];

export type ParsedSubmitBody =
  | { ok: true; value: {
      request_text: string;
      trigger: StudyRunTriggerV1;
      idempotency_key: string;
      clarification_json: StudyIntentClarificationV1 | null;
    } }
  | { ok: false; message: string };

export function parseSubmitStudyProcessingBody(body: unknown): ParsedSubmitBody {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "Request body is required." };
  }
  const record = body as Record<string, unknown>;
  const requestText = typeof record.request_text === "string" ? record.request_text.trim() : "";
  if (!requestText) {
    return { ok: false, message: "Describe what you want this study to answer." };
  }
  if (requestText.length > 4000) {
    return { ok: false, message: "Your request is too long." };
  }
  const trigger =
    typeof record.trigger === "string" && TRIGGERS.includes(record.trigger as StudyRunTriggerV1)
      ? (record.trigger as StudyRunTriggerV1)
      : "study";
  const idempotencyKey =
    typeof record.idempotency_key === "string" ? record.idempotency_key.trim() : "";
  if (!idempotencyKey || idempotencyKey.length > 128) {
    return { ok: false, message: "This request could not be submitted." };
  }
  const rawHint = domainHintFromRecord(record.clarification_json);
  const clarification = clarificationJsonForDomainHint(rawHint);
  if (submittedDomainHint(record.clarification_json) && !clarification) {
    return { ok: false, message: "The selected Domain Pack is not valid." };
  }
  if (clarification?.domain_hint) {
    const pack = getPublicDomainPack(clarification.domain_hint);
    if (!pack?.executable) {
      return { ok: false, message: "This Domain Pack is not available for analysis yet." };
    }
  }
  return {
    ok: true,
    value: {
      request_text: requestText,
      trigger,
      idempotency_key: idempotencyKey,
      clarification_json: clarification,
    },
  };
}

function domainHintFromRecord(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const hint = (value as Record<string, unknown>).domain_hint;
  return typeof hint === "string" ? hint.trim() : null;
}

function submittedDomainHint(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const hint = (value as Record<string, unknown>).domain_hint;
  return hint != null && hint !== "";
}

export function parseStudyRunIdParam(value: string): string | null {
  const trimmed = value.trim();
  if (!/^[0-9a-f-]{36}$/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}
