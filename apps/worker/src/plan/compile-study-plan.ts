import type { DomainPackManifestV3 } from "@hiveforyou/contracts/domain-packs/v3";
import {
  STUDY_PLAN_KIND,
  STUDY_QUESTION_COVERAGE_KIND,
  type StudyPlanV1,
  type StudyQuestionCoverageV1,
  type StudyQuestionSetV1,
} from "@hiveforyou/contracts/study-runs/v1";
import {
  computeInvestigationRunKey,
  computeParameterScopeHash,
  parseQuestionPlanBudgets,
  type QuestionPlanBudgetsV1,
} from "@hiveforyou/core";

export type ClassifiedDocumentSummaryV1 = {
  source_document_id: string;
  document_type_id: string | null;
};

const DELIVERY_DOC_TYPE = "iep.service.implementation";

function investigationEligible(
  investigationId: string,
  summaries: ClassifiedDocumentSummaryV1[],
): { execute: boolean; skip_reason: string | null } {
  if (investigationId === "service_commitment_versus_delivery") {
    const hasDeliveryLog = summaries.some(
      (row) => row.document_type_id === DELIVERY_DOC_TYPE,
    );
    return hasDeliveryLog
      ? { execute: true, skip_reason: null }
      : {
          execute: false,
          skip_reason: "MISSING_SERVICE_DELIVERY_OBSERVATION",
        };
  }
  return { execute: true, skip_reason: null };
}

export function compileStudyPlanAndCoverage(input: {
  questionSet: StudyQuestionSetV1;
  pack: DomainPackManifestV3 | null;
  classifiedDocuments: ClassifiedDocumentSummaryV1[];
  basedOnRevisionId?: string | null;
  budgets?: QuestionPlanBudgetsV1;
}): { plan: StudyPlanV1; coverage: StudyQuestionCoverageV1 } {
  const budgets = input.budgets ?? parseQuestionPlanBudgets();
  const investigationById = new Map(
    (input.pack?.investigations.items ?? []).map((item) => [item.investigation_id, item]),
  );

  const scheduledKeys = new Set<string>();
  const investigation_execution_plan: StudyPlanV1["investigation_execution_plan"] = [];
  const deferred_investigations: NonNullable<StudyPlanV1["deferred_investigations"]> = [];
  let scheduledCount = 0;

  for (const binding of input.questionSet.investigation_bindings) {
    if (binding.priority_class === "SUGGESTED") {
      continue;
    }
    const operator = investigationById.get(binding.investigation_id);
    const parameter_scope_hash = computeParameterScopeHash([
      binding.study_question_id,
      binding.investigation_id,
    ]);
    const evidence_scope_hash = computeParameterScopeHash(
      input.classifiedDocuments.map(
        (doc) => `${doc.source_document_id}:${doc.document_type_id ?? "unknown"}`,
      ),
    );
    const run_key = computeInvestigationRunKey({
      investigation_id: binding.investigation_id,
      operator_id: operator?.operator_id ?? "unknown",
      operator_version: operator?.operator_version ?? "investigation-operator@1",
      parameter_scope_hash,
      evidence_scope_hash,
      based_on_revision_id: input.basedOnRevisionId ?? null,
    });
    if (scheduledKeys.has(run_key)) {
      continue;
    }
    scheduledKeys.add(run_key);
    const eligibility = investigationEligible(binding.investigation_id, input.classifiedDocuments);
    if (!eligibility.execute) {
      investigation_execution_plan.push({
        investigation_id: binding.investigation_id,
        run_key,
        execute: false,
        skip_reason: eligibility.skip_reason,
      });
      continue;
    }
    if (scheduledCount >= budgets.max_investigations_executed) {
      deferred_investigations.push({
        investigation_id: binding.investigation_id,
        run_key,
        deferred_reason: "BUDGET_EXHAUSTED",
      });
      investigation_execution_plan.push({
        investigation_id: binding.investigation_id,
        run_key,
        execute: false,
        deferred_reason: "BUDGET_EXHAUSTED",
      });
      continue;
    }
    scheduledCount += 1;
    investigation_execution_plan.push({
      investigation_id: binding.investigation_id,
      run_key,
      execute: true,
    });
  }

  const budget_outcome =
    deferred_investigations.length > 0 ? "PARTIAL_DEFERRED" : "WITHIN_BUDGET";

  const plan: StudyPlanV1 = {
    contract_version: STUDY_PLAN_KIND,
    study_run_id: input.questionSet.study_run_id,
    study_question_set_hash: input.questionSet.content_hash,
    reuse_summary: {
      assertions_reused: 0,
      findings_reused: 0,
      investigations_scheduled: investigation_execution_plan.filter((row) => row.execute).length,
      investigations_skipped: investigation_execution_plan.filter((row) => !row.execute).length,
      investigations_deferred: deferred_investigations.length,
    },
    investigation_execution_plan,
    budgets,
    budget_outcome,
    deferred_investigations: deferred_investigations.length ? deferred_investigations : undefined,
  };

  const coverage: StudyQuestionCoverageV1 = {
    contract_version: STUDY_QUESTION_COVERAGE_KIND,
    study_run_id: input.questionSet.study_run_id,
    study_question_set_hash: input.questionSet.content_hash,
    questions: input.questionSet.merged_questions.map((question) => ({
      study_question_id: question.study_question_id,
      evidence_coverage: "NOT_ASSESSED",
      answer_status: "NOT_EVALUATED",
    })),
  };

  return { plan, coverage };
}
