import { ErrorCode } from "@hiveforyou/contracts/errors/v1";
import { featuresFromRecord, type EquivalenceFeaturesV1 } from "@hiveforyou/core";

import { PlanningError } from "./errors.js";
import type { ReasoningJsonClient } from "../reasoning/types.js";

export type AtomicQuestionProposalV1 = {
  atomic_question_id: string;
  text: string;
  span_start: number;
  span_end: number;
  features: EquivalenceFeaturesV1;
  proposed_catalog_question_id: string | null;
  match_status: "proposed" | "ambiguous" | "none";
};

export type QuestionDecompositionResultV1 = {
  atomic_questions: AtomicQuestionProposalV1[];
};

const TASK = "plan_questions_decompose" as const;

function isNonEmptyString(value: unknown, max = 2000): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

export function parseQuestionDecompositionModelOutput(raw: unknown): QuestionDecompositionResultV1 {
  if (!raw || typeof raw !== "object") {
    throw new PlanningError(ErrorCode.MODEL_OUTPUT_INVALID, "Invalid decomposition payload.", {
      reason: "not_object",
    });
  }
  const atomicRaw = (raw as { atomic_questions?: unknown }).atomic_questions;
  if (!Array.isArray(atomicRaw) || atomicRaw.length < 1) {
    throw new PlanningError(ErrorCode.MODEL_OUTPUT_INVALID, "Decomposition requires atomic questions.", {
      reason: "missing_atomics",
    });
  }
  const atomic_questions: AtomicQuestionProposalV1[] = [];
  for (const entry of atomicRaw) {
    if (!entry || typeof entry !== "object") {
      throw new PlanningError(ErrorCode.MODEL_OUTPUT_INVALID, "Invalid atomic question entry.", {
        reason: "atomic_not_object",
      });
    }
    const row = entry as Record<string, unknown>;
    if (!isNonEmptyString(row.atomic_question_id, 128)) {
      throw new PlanningError(ErrorCode.MODEL_OUTPUT_INVALID, "Invalid atomic_question_id.", {
        reason: "atomic_id",
      });
    }
    if (!isNonEmptyString(row.text, 4000)) {
      throw new PlanningError(ErrorCode.MODEL_OUTPUT_INVALID, "Invalid atomic question text.", {
        reason: "atomic_text",
      });
    }
    const span = row.span as { start?: unknown; end?: unknown } | undefined;
    const span_start = typeof span?.start === "number" ? span.start : 0;
    const span_end = typeof span?.end === "number" ? span.end : row.text.length;
    const matchStatus = row.match_status;
    const normalizedStatus =
      matchStatus === "proposed" || matchStatus === "ambiguous" || matchStatus === "none"
        ? matchStatus
        : "none";
    const proposed =
      typeof row.proposed_catalog_question_id === "string" && row.proposed_catalog_question_id.trim()
        ? row.proposed_catalog_question_id.trim()
        : null;
    atomic_questions.push({
      atomic_question_id: row.atomic_question_id.trim(),
      text: row.text.trim(),
      span_start,
      span_end,
      features: featuresFromRecord(row),
      proposed_catalog_question_id: proposed,
      match_status: normalizedStatus,
    });
  }
  return { atomic_questions };
}

export async function requestQuestionDecomposition(input: {
  intentText: string;
  catalogQuestionSummaries: { question_id: string; canonical_question: string }[];
  reasoning: ReasoningJsonClient;
  correlationId?: string;
}): Promise<QuestionDecompositionResultV1> {
  const result = await input.reasoning.completeJson({
    task: TASK,
    correlationId: input.correlationId,
    systemPrompt:
      "Decompose uploader study intent into atomic questions. Return JSON with atomic_questions[]. " +
      "Each entry needs atomic_question_id, text, span {start,end}, features {subject,time_period,population,document_scope,qualifiers}, " +
      "proposed_catalog_question_id (hint only), match_status (proposed|ambiguous|none). " +
      "Similarity is not equivalence. Never drop wording.",
    userPayload: {
      intent_text: input.intentText,
      catalog_questions: input.catalogQuestionSummaries,
    },
  });
  return parseQuestionDecompositionModelOutput(result.parsed);
}
