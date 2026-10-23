import { createHash, randomUUID } from "node:crypto";

import type { DomainPackManifestV3 } from "@hiveforyou/contracts/domain-packs/v3";
import { ErrorCode } from "@hiveforyou/contracts/errors/v1";
import {
  STUDY_QUESTION_SET_KIND,
  type DeduplicationLogEntryV1,
  type InvestigationBindingV1,
  type MergedQuestionV1,
  type StudyQuestionSetV1,
} from "@hiveforyou/contracts/study-runs/v1";
import { equivalenceFeaturesAlign, type EquivalenceFeaturesV1 } from "@hiveforyou/core";

import { selectCatalogQuestions } from "./catalog-selection.js";
import { PlanningError } from "./errors.js";
import {
  requestQuestionDecomposition,
  type AtomicQuestionProposalV1,
} from "./question-decompose-model.js";
import type { ReasoningJsonClient } from "../reasoning/types.js";
import { finalizeStudyQuestionSet } from "../persistence/study-question-set-digest.js";

export const QUESTION_PLANNER_VERSION = "p2.2-dp.i@1" as const;

export function hashIntentText(intentText: string): string {
  return createHash("sha256").update(intentText.trim(), "utf8").digest("hex");
}

function catalogFeatures(questionId: string): EquivalenceFeaturesV1 {
  if (questionId === "Q02") {
    return {
      subject: null,
      time_period: "overall",
      population: "overall",
      document_scope: "upload",
      qualifiers: "progress_overall",
    };
  }
  return {
    subject: null,
    time_period: null,
    population: null,
    document_scope: "upload",
    qualifiers: questionId.toLowerCase(),
  };
}

function buildInvestigationBindings(
  merged: MergedQuestionV1[],
  manifest: DomainPackManifestV3 | null,
): InvestigationBindingV1[] {
  if (!manifest) {
    return [];
  }
  const bindings: InvestigationBindingV1[] = [];
  for (const question of merged) {
    const catalogId = question.catalog_question_id;
    if (!catalogId) {
      continue;
    }
    const catalog = manifest.views_and_outcomes.canonical_questions.find(
      (entry) => entry.question_id === catalogId,
    );
    if (!catalog) {
      continue;
    }
    for (const [index, investigationId] of catalog.investigation_ids.entries()) {
      bindings.push({
        study_question_id: question.study_question_id,
        investigation_id: investigationId,
        priority_class: index < 3 ? "CORE" : "CONDITIONAL",
      });
    }
  }
  return bindings;
}

function mergeUploaderAndCatalog(input: {
  atomics: AtomicQuestionProposalV1[];
  catalogSelected: ReturnType<typeof selectCatalogQuestions>;
}): { merged_questions: MergedQuestionV1[]; deduplication_log: DeduplicationLogEntryV1[] } {
  const merged_questions: MergedQuestionV1[] = [];
  const deduplication_log: DeduplicationLogEntryV1[] = [];
  const consumedAtomic = new Set<string>();

  for (const catalog of input.catalogSelected) {
    const catalogFeaturesSnapshot = catalogFeatures(catalog.question_id);
    let mergedWith: AtomicQuestionProposalV1 | null = null;
    for (const atomic of input.atomics) {
      if (consumedAtomic.has(atomic.atomic_question_id)) {
        continue;
      }
      const decision = equivalenceFeaturesAlign(atomic.features, catalogFeaturesSnapshot);
      const proposalMatches =
        atomic.proposed_catalog_question_id === catalog.question_id &&
        atomic.match_status === "proposed";
      if (decision.can_merge && proposalMatches) {
        mergedWith = atomic;
        break;
      }
    }
    const studyQuestionId = randomUUID();
    if (mergedWith) {
      consumedAtomic.add(mergedWith.atomic_question_id);
      merged_questions.push({
        study_question_id: studyQuestionId,
        display_label: catalog.canonical_question,
        catalog_question_id: catalog.question_id,
        origins: [
          { atomic_question_id: mergedWith.atomic_question_id, source: "uploader" },
          { atomic_question_id: catalog.question_id, source: "catalog" },
        ],
        equivalence_class_id: `eq_${catalog.question_id}`,
      });
      deduplication_log.push({
        decision: "merged",
        reason_codes: ["catalog_equivalence_and_proposal"],
        study_question_ids: [studyQuestionId],
      });
    } else {
      merged_questions.push({
        study_question_id: studyQuestionId,
        display_label: catalog.canonical_question,
        catalog_question_id: catalog.question_id,
        origins: [{ atomic_question_id: catalog.question_id, source: "catalog" }],
      });
      deduplication_log.push({
        decision: "kept_distinct",
        reason_codes: ["catalog_selected_no_equivalent_atomic"],
        study_question_ids: [studyQuestionId],
      });
    }
  }

  for (const atomic of input.atomics) {
    if (consumedAtomic.has(atomic.atomic_question_id)) {
      continue;
    }
    const studyQuestionId = randomUUID();
    const related =
      atomic.proposed_catalog_question_id && atomic.match_status === "ambiguous"
        ? [atomic.proposed_catalog_question_id]
        : atomic.proposed_catalog_question_id
          ? [atomic.proposed_catalog_question_id]
          : undefined;
    merged_questions.push({
      study_question_id: studyQuestionId,
      display_label: atomic.text,
      catalog_question_id: null,
      related_catalog_question_ids: related,
      origins: [{ atomic_question_id: atomic.atomic_question_id, source: "uploader" }],
    });
    deduplication_log.push({
      decision: "kept_distinct",
      reason_codes:
        atomic.match_status === "ambiguous"
          ? ["ambiguous_catalog_match"]
          : ["uploader_dynamic_question"],
      study_question_ids: [studyQuestionId],
    });
  }

  return { merged_questions, deduplication_log };
}

export async function buildStudyQuestionSet(input: {
  studyRunId: string;
  intentId: string;
  intentText: string;
  pack: { manifest: DomainPackManifestV3; digest: string } | null;
  reasoning: ReasoningJsonClient;
  correlationId?: string;
}): Promise<StudyQuestionSetV1> {
  if (!input.intentText.trim()) {
    throw new PlanningError(ErrorCode.INVALID_REQUEST, "Intent text is required for question planning.", {
      reason: "empty_intent",
    });
  }
  if (!input.intentId.trim()) {
    throw new PlanningError(ErrorCode.INVALID_REQUEST, "Intent id is required for question planning.", {
      reason: "missing_intent_id",
    });
  }

  const catalogSummaries =
    input.pack?.manifest.views_and_outcomes.canonical_questions.map((question) => ({
      question_id: question.question_id,
      canonical_question: question.canonical_question,
    })) ?? [];

  const decomposition = await requestQuestionDecomposition({
    intentText: input.intentText,
    catalogQuestionSummaries: catalogSummaries,
    reasoning: input.reasoning,
    correlationId: input.correlationId,
  });

  const proposedIds = new Set(
    decomposition.atomic_questions
      .map((atomic) => atomic.proposed_catalog_question_id)
      .filter((id): id is string => Boolean(id)),
  );
  const catalogSelected = selectCatalogQuestions({
    manifest: input.pack?.manifest ?? null,
    intentText: input.intentText,
    proposedCatalogIds: proposedIds,
  });
  const { merged_questions, deduplication_log } = mergeUploaderAndCatalog({
    atomics: decomposition.atomic_questions,
    catalogSelected,
  });
  const investigation_bindings = buildInvestigationBindings(merged_questions, input.pack?.manifest ?? null);

  const frozen_at = new Date().toISOString();
  const text_hash = hashIntentText(input.intentText);
  const withoutHash: Omit<StudyQuestionSetV1, "content_hash"> = {
    contract_version: STUDY_QUESTION_SET_KIND,
    study_run_id: input.studyRunId.toLowerCase(),
    intent_id: input.intentId.toLowerCase(),
    text_hash,
    frozen_at,
    planner_version: QUESTION_PLANNER_VERSION,
    merged_questions,
    investigation_bindings,
    deduplication_log,
    ...(input.pack
      ? {
          pack_id: input.pack.manifest.pack_id,
          pack_version: input.pack.manifest.pack_version,
        }
      : {}),
  };
  const questionSet = finalizeStudyQuestionSet(withoutHash);

  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      service: "worker",
      stage: "plan_questions",
      study_run_id: input.studyRunId,
      correlation_id: input.correlationId ?? null,
      atomic_count: decomposition.atomic_questions.length,
      merged_count: merged_questions.length,
      catalog_count: catalogSelected.length,
      pack_digest_prefix: input.pack?.digest?.slice(0, 12) ?? null,
      content_hash_prefix: questionSet.content_hash.slice(0, 12),
    }),
  );

  return questionSet;
}
