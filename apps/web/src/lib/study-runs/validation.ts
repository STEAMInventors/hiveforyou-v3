import type { StudyRunTriggerV1 } from "@hiveforyou/contracts/study-runs/v1";

const TRIGGERS: StudyRunTriggerV1[] = ["generate", "reprocess", "study"];

export type ParsedSubmitBody =
  | { ok: true; value: {
      request_text: string;
      trigger: StudyRunTriggerV1;
      idempotency_key: string;
      clarification_json: Record<string, unknown> | null;
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
  const clarification =
    record.clarification_json && typeof record.clarification_json === "object"
      ? (record.clarification_json as Record<string, unknown>)
      : null;
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

export function parseStudyRunIdParam(value: string): string | null {
  const trimmed = value.trim();
  if (!/^[0-9a-f-]{36}$/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}
