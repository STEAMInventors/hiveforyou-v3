export const STUDY_QUESTION_SET_KIND = "study-question-set@1" as const;
export const STUDY_PLAN_KIND = "study-plan@1" as const;
export const STUDY_QUESTION_COVERAGE_KIND = "study-question-coverage@1" as const;

export const PLANNING_ARTIFACT_KINDS = [
  STUDY_QUESTION_SET_KIND,
  STUDY_PLAN_KIND,
  STUDY_QUESTION_COVERAGE_KIND,
] as const;

export type PlanningArtifactKindV1 = (typeof PLANNING_ARTIFACT_KINDS)[number];

export type QuestionOriginSourceV1 = "uploader" | "catalog" | "prior_unresolved";

export type QuestionOriginV1 = {
  atomic_question_id: string;
  source: QuestionOriginSourceV1;
};

export type MergedQuestionV1 = {
  study_question_id: string;
  display_label: string;
  origins: QuestionOriginV1[];
  catalog_question_id?: string | null;
  equivalence_class_id?: string | null;
  related_catalog_question_ids?: string[];
};

export type InvestigationBindingPriorityV1 = "CORE" | "CONDITIONAL" | "SUGGESTED";

export type InvestigationBindingV1 = {
  study_question_id: string;
  investigation_id: string;
  priority_class: InvestigationBindingPriorityV1;
};

export type DeduplicationDecisionV1 = "merged" | "kept_distinct";

export type DeduplicationLogEntryV1 = {
  decision: DeduplicationDecisionV1;
  reason_codes: string[];
  study_question_ids: string[];
};

export type StudyQuestionSetV1 = {
  contract_version: typeof STUDY_QUESTION_SET_KIND;
  study_run_id: string;
  intent_id: string;
  text_hash: string;
  frozen_at: string;
  planner_version: string;
  content_hash: string;
  merged_questions: MergedQuestionV1[];
  investigation_bindings: InvestigationBindingV1[];
  deduplication_log?: DeduplicationLogEntryV1[];
  pack_id?: string | null;
  pack_version?: string | null;
};

export type StudyPlanReuseSummaryV1 = {
  assertions_reused: number;
  findings_reused: number;
  investigations_scheduled: number;
  investigations_skipped: number;
  investigations_deferred: number;
};

export type StudyPlanInvestigationExecutionV1 = {
  investigation_id: string;
  run_key: string;
  execute: boolean;
  skip_reason?: string | null;
  deferred_reason?: string | null;
};

export type StudyPlanBudgetsV1 = {
  max_investigations_executed: number;
  max_model_reasoning_calls: number;
  max_new_sources_read: number;
};

export type StudyPlanBudgetOutcomeV1 = "WITHIN_BUDGET" | "PARTIAL_DEFERRED";

export type StudyPlanDeferredInvestigationV1 = {
  investigation_id: string;
  run_key: string;
  deferred_reason: string;
};

export type StudyPlanV1 = {
  contract_version: typeof STUDY_PLAN_KIND;
  study_run_id: string;
  study_question_set_hash: string;
  reuse_summary: StudyPlanReuseSummaryV1;
  investigation_execution_plan: StudyPlanInvestigationExecutionV1[];
  budgets: StudyPlanBudgetsV1;
  budget_outcome: StudyPlanBudgetOutcomeV1;
  deferred_investigations?: StudyPlanDeferredInvestigationV1[];
};

export type EvidenceCoverageV1 =
  | "NOT_ASSESSED"
  | "IN_SCOPE_COMPLETE"
  | "IN_SCOPE_PARTIAL"
  | "OUT_OF_SCOPE"
  | "BLOCKED";

export type AnswerStatusV1 =
  | "NOT_EVALUATED"
  | "SUPPORTED"
  | "PARTIAL"
  | "UNRESOLVED"
  | "NOT_FOUND_IN_REVIEWED_SCOPE"
  | "BLOCKED";

export type ReviewedScopeV1 = {
  source_document_ids: string[];
  document_type_ids: string[];
  date_window?: { start: string | null; end: string | null } | null;
};

export type InvestigationDispositionV1 = {
  run_key: string;
  disposition: string;
  deferred_reason?: string | null;
};

export type StudyQuestionCoverageItemV1 = {
  study_question_id: string;
  evidence_coverage: EvidenceCoverageV1;
  answer_status: AnswerStatusV1;
  reviewed_scope?: ReviewedScopeV1;
  missing_evidence?: string[];
  investigation_dispositions?: InvestigationDispositionV1[];
  supporting_assertion_ids?: string[];
  supporting_finding_ids?: string[];
};

export type StudyQuestionCoverageV1 = {
  contract_version: typeof STUDY_QUESTION_COVERAGE_KIND;
  study_run_id: string;
  study_question_set_hash: string;
  questions: StudyQuestionCoverageItemV1[];
};

export type PlanningArtifactParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string; field?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/i;

/** Keys that must never appear in a question-set artifact (verbatim intent lives in hive3.intents). */
export const QUESTION_SET_FORBIDDEN_KEYS = [
  "request_text",
  "intent_text",
  "uploader_text",
  "verbatim_intent",
  "clarification_text",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown, maxLen = 512): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLen;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX_RE.test(value);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

function containsForbiddenIntentKeys(value: unknown, path = ""): string | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const hit = containsForbiddenIntentKeys(value[i], `${path}[${i}]`);
      if (hit) {
        return hit;
      }
    }
    return null;
  }
  if (!isRecord(value)) {
    return null;
  }
  for (const key of Object.keys(value)) {
    if ((QUESTION_SET_FORBIDDEN_KEYS as readonly string[]).includes(key)) {
      return path ? `${path}.${key}` : key;
    }
    const nested = containsForbiddenIntentKeys(value[key], path ? `${path}.${key}` : key);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function parseQuestionOrigin(value: unknown): PlanningArtifactParseResult<QuestionOriginV1> {
  if (!isRecord(value)) {
    return { ok: false, message: "Question origin must be an object.", field: "origins" };
  }
  if (!isNonEmptyString(value.atomic_question_id, 128)) {
    return { ok: false, message: "atomic_question_id is required.", field: "origins" };
  }
  const source = value.source;
  if (source !== "uploader" && source !== "catalog" && source !== "prior_unresolved") {
    return { ok: false, message: "Invalid origin source.", field: "origins" };
  }
  return { ok: true, value: { atomic_question_id: value.atomic_question_id.trim(), source } };
}

function parseMergedQuestion(value: unknown): PlanningArtifactParseResult<MergedQuestionV1> {
  if (!isRecord(value)) {
    return { ok: false, message: "Merged question must be an object.", field: "merged_questions" };
  }
  if (!isNonEmptyString(value.study_question_id, 128)) {
    return { ok: false, message: "study_question_id is required.", field: "merged_questions" };
  }
  if (!isNonEmptyString(value.display_label, 256)) {
    return { ok: false, message: "display_label is required.", field: "merged_questions" };
  }
  if (!Array.isArray(value.origins) || value.origins.length === 0) {
    return { ok: false, message: "origins must be a non-empty array.", field: "merged_questions" };
  }
  const origins: QuestionOriginV1[] = [];
  for (const item of value.origins) {
    const parsed = parseQuestionOrigin(item);
    if (!parsed.ok) {
      return parsed;
    }
    origins.push(parsed.value);
  }
  const merged: MergedQuestionV1 = {
    study_question_id: value.study_question_id.trim(),
    display_label: value.display_label.trim(),
    origins,
  };
  if (value.catalog_question_id !== undefined && value.catalog_question_id !== null) {
    if (!isNonEmptyString(value.catalog_question_id, 64)) {
      return { ok: false, message: "Invalid catalog_question_id.", field: "merged_questions" };
    }
    merged.catalog_question_id = value.catalog_question_id.trim();
  }
  if (value.equivalence_class_id !== undefined && value.equivalence_class_id !== null) {
    if (!isNonEmptyString(value.equivalence_class_id, 128)) {
      return { ok: false, message: "Invalid equivalence_class_id.", field: "merged_questions" };
    }
    merged.equivalence_class_id = value.equivalence_class_id.trim();
  }
  if (value.related_catalog_question_ids !== undefined) {
    if (!Array.isArray(value.related_catalog_question_ids)) {
      return { ok: false, message: "related_catalog_question_ids must be an array.", field: "merged_questions" };
    }
    merged.related_catalog_question_ids = value.related_catalog_question_ids.map((id) => {
      if (!isNonEmptyString(id, 64)) {
        throw new Error("invalid related_catalog_question_id");
      }
      return id.trim();
    });
  }
  return { ok: true, value: merged };
}

function parseInvestigationBinding(value: unknown): PlanningArtifactParseResult<InvestigationBindingV1> {
  if (!isRecord(value)) {
    return { ok: false, message: "Investigation binding must be an object.", field: "investigation_bindings" };
  }
  if (!isNonEmptyString(value.study_question_id, 128)) {
    return { ok: false, message: "study_question_id is required.", field: "investigation_bindings" };
  }
  if (!isNonEmptyString(value.investigation_id, 128)) {
    return { ok: false, message: "investigation_id is required.", field: "investigation_bindings" };
  }
  const priority = value.priority_class;
  if (priority !== "CORE" && priority !== "CONDITIONAL" && priority !== "SUGGESTED") {
    return { ok: false, message: "Invalid priority_class.", field: "investigation_bindings" };
  }
  return {
    ok: true,
    value: {
      study_question_id: value.study_question_id.trim(),
      investigation_id: value.investigation_id.trim(),
      priority_class: priority,
    },
  };
}

export function parseStudyQuestionSetV1(value: unknown): PlanningArtifactParseResult<StudyQuestionSetV1> {
  if (!isRecord(value)) {
    return { ok: false, message: "Question set payload must be an object." };
  }
  if (value.contract_version !== STUDY_QUESTION_SET_KIND) {
    return { ok: false, message: "Invalid contract_version for study-question-set@1.", field: "contract_version" };
  }
  const forbidden = containsForbiddenIntentKeys(value);
  if (forbidden) {
    return { ok: false, message: "Question set must not contain verbatim intent fields.", field: forbidden };
  }
  if (!isUuid(value.study_run_id)) {
    return { ok: false, message: "study_run_id must be a UUID.", field: "study_run_id" };
  }
  if (!isUuid(value.intent_id)) {
    return { ok: false, message: "intent_id must be a UUID.", field: "intent_id" };
  }
  if (!isSha256Hex(value.text_hash)) {
    return { ok: false, message: "text_hash must be a SHA-256 hex digest.", field: "text_hash" };
  }
  if (!isIsoTimestamp(value.frozen_at)) {
    return { ok: false, message: "frozen_at must be an ISO-8601 timestamp.", field: "frozen_at" };
  }
  if (!isNonEmptyString(value.planner_version, 64)) {
    return { ok: false, message: "planner_version is required.", field: "planner_version" };
  }
  if (!isSha256Hex(value.content_hash)) {
    return { ok: false, message: "content_hash must be a SHA-256 hex digest.", field: "content_hash" };
  }
  if (!Array.isArray(value.merged_questions) || value.merged_questions.length === 0) {
    return { ok: false, message: "merged_questions must be a non-empty array.", field: "merged_questions" };
  }
  const merged_questions: MergedQuestionV1[] = [];
  for (const item of value.merged_questions) {
    try {
      const parsed = parseMergedQuestion(item);
      if (!parsed.ok) {
        return parsed;
      }
      merged_questions.push(parsed.value);
    } catch {
      return { ok: false, message: "Invalid related_catalog_question_ids entry.", field: "merged_questions" };
    }
  }
  if (!Array.isArray(value.investigation_bindings)) {
    return { ok: false, message: "investigation_bindings must be an array.", field: "investigation_bindings" };
  }
  const investigation_bindings: InvestigationBindingV1[] = [];
  for (const item of value.investigation_bindings) {
    const parsed = parseInvestigationBinding(item);
    if (!parsed.ok) {
      return parsed;
    }
    investigation_bindings.push(parsed.value);
  }
  const artifact: StudyQuestionSetV1 = {
    contract_version: STUDY_QUESTION_SET_KIND,
    study_run_id: value.study_run_id.toLowerCase(),
    intent_id: value.intent_id.toLowerCase(),
    text_hash: value.text_hash.toLowerCase(),
    frozen_at: value.frozen_at,
    planner_version: value.planner_version.trim(),
    content_hash: value.content_hash.toLowerCase(),
    merged_questions,
    investigation_bindings,
  };
  if (value.deduplication_log !== undefined) {
    if (!Array.isArray(value.deduplication_log)) {
      return { ok: false, message: "deduplication_log must be an array.", field: "deduplication_log" };
    }
    artifact.deduplication_log = value.deduplication_log.map((entry) => {
      if (!isRecord(entry)) {
        throw new Error("invalid deduplication_log entry");
      }
      if (entry.decision !== "merged" && entry.decision !== "kept_distinct") {
        throw new Error("invalid deduplication decision");
      }
      if (!Array.isArray(entry.reason_codes) || !Array.isArray(entry.study_question_ids)) {
        throw new Error("invalid deduplication_log shape");
      }
      return {
        decision: entry.decision,
        reason_codes: entry.reason_codes.map(String),
        study_question_ids: entry.study_question_ids.map(String),
      };
    });
  }
  if (value.pack_id !== undefined && value.pack_id !== null) {
    if (!isNonEmptyString(value.pack_id, 128)) {
      return { ok: false, message: "Invalid pack_id.", field: "pack_id" };
    }
    artifact.pack_id = value.pack_id.trim();
  }
  if (value.pack_version !== undefined && value.pack_version !== null) {
    if (!isNonEmptyString(value.pack_version, 64)) {
      return { ok: false, message: "Invalid pack_version.", field: "pack_version" };
    }
    artifact.pack_version = value.pack_version.trim();
  }
  return { ok: true, value: artifact };
}

function parseNonNegativeInt(value: unknown, field: string): PlanningArtifactParseResult<number> {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return { ok: false, message: `${field} must be a non-negative integer.`, field };
  }
  return { ok: true, value };
}

export function parseStudyPlanV1(value: unknown): PlanningArtifactParseResult<StudyPlanV1> {
  if (!isRecord(value)) {
    return { ok: false, message: "Study plan payload must be an object." };
  }
  if (value.contract_version !== STUDY_PLAN_KIND) {
    return { ok: false, message: "Invalid contract_version for study-plan@1.", field: "contract_version" };
  }
  if (!isUuid(value.study_run_id)) {
    return { ok: false, message: "study_run_id must be a UUID.", field: "study_run_id" };
  }
  if (!isSha256Hex(value.study_question_set_hash)) {
    return { ok: false, message: "study_question_set_hash must be a SHA-256 hex digest.", field: "study_question_set_hash" };
  }
  if (!isRecord(value.reuse_summary)) {
    return { ok: false, message: "reuse_summary is required.", field: "reuse_summary" };
  }
  const reuseFields = [
    "assertions_reused",
    "findings_reused",
    "investigations_scheduled",
    "investigations_skipped",
    "investigations_deferred",
  ] as const;
  const reuse_summary = {} as StudyPlanReuseSummaryV1;
  for (const key of reuseFields) {
    const parsed = parseNonNegativeInt(value.reuse_summary[key], `reuse_summary.${key}`);
    if (!parsed.ok) {
      return parsed;
    }
    reuse_summary[key] = parsed.value;
  }
  if (!Array.isArray(value.investigation_execution_plan)) {
    return { ok: false, message: "investigation_execution_plan must be an array.", field: "investigation_execution_plan" };
  }
  const investigation_execution_plan: StudyPlanInvestigationExecutionV1[] = [];
  for (const item of value.investigation_execution_plan) {
    if (!isRecord(item)) {
      return { ok: false, message: "Invalid investigation execution entry.", field: "investigation_execution_plan" };
    }
    if (!isNonEmptyString(item.investigation_id, 128)) {
      return { ok: false, message: "investigation_id is required.", field: "investigation_execution_plan" };
    }
    if (!isSha256Hex(item.run_key)) {
      return { ok: false, message: "run_key must be a SHA-256 hex digest.", field: "investigation_execution_plan" };
    }
    if (typeof item.execute !== "boolean") {
      return { ok: false, message: "execute must be boolean.", field: "investigation_execution_plan" };
    }
    const execution: StudyPlanInvestigationExecutionV1 = {
      investigation_id: item.investigation_id.trim(),
      run_key: item.run_key.toLowerCase(),
      execute: item.execute,
    };
    if (typeof item.skip_reason === "string") {
      execution.skip_reason = item.skip_reason;
    }
    if (typeof item.deferred_reason === "string") {
      execution.deferred_reason = item.deferred_reason;
    }
    investigation_execution_plan.push(execution);
  }
  if (!isRecord(value.budgets)) {
    return { ok: false, message: "budgets is required.", field: "budgets" };
  }
  const budgetFields = [
    "max_investigations_executed",
    "max_model_reasoning_calls",
    "max_new_sources_read",
  ] as const;
  const budgets = {} as StudyPlanBudgetsV1;
  for (const key of budgetFields) {
    const parsed = parseNonNegativeInt(value.budgets[key], `budgets.${key}`);
    if (!parsed.ok) {
      return parsed;
    }
    budgets[key] = parsed.value;
  }
  if (value.budget_outcome !== "WITHIN_BUDGET" && value.budget_outcome !== "PARTIAL_DEFERRED") {
    return { ok: false, message: "Invalid budget_outcome.", field: "budget_outcome" };
  }
  const plan: StudyPlanV1 = {
    contract_version: STUDY_PLAN_KIND,
    study_run_id: value.study_run_id.toLowerCase(),
    study_question_set_hash: value.study_question_set_hash.toLowerCase(),
    reuse_summary,
    investigation_execution_plan,
    budgets,
    budget_outcome: value.budget_outcome,
  };
  if (value.deferred_investigations !== undefined) {
    if (!Array.isArray(value.deferred_investigations)) {
      return { ok: false, message: "deferred_investigations must be an array.", field: "deferred_investigations" };
    }
    plan.deferred_investigations = value.deferred_investigations.map((entry) => {
      if (!isRecord(entry)) {
        throw new Error("invalid deferred_investigation");
      }
      if (!isNonEmptyString(entry.investigation_id, 128) || !isSha256Hex(entry.run_key) || !isNonEmptyString(entry.deferred_reason, 256)) {
        throw new Error("invalid deferred_investigation fields");
      }
      return {
        investigation_id: entry.investigation_id.trim(),
        run_key: entry.run_key.toLowerCase(),
        deferred_reason: entry.deferred_reason.trim(),
      };
    });
  }
  return { ok: true, value: plan };
}

const EVIDENCE_COVERAGE_VALUES: EvidenceCoverageV1[] = [
  "NOT_ASSESSED",
  "IN_SCOPE_COMPLETE",
  "IN_SCOPE_PARTIAL",
  "OUT_OF_SCOPE",
  "BLOCKED",
];

const ANSWER_STATUS_VALUES: AnswerStatusV1[] = [
  "NOT_EVALUATED",
  "SUPPORTED",
  "PARTIAL",
  "UNRESOLVED",
  "NOT_FOUND_IN_REVIEWED_SCOPE",
  "BLOCKED",
];

export function parseStudyQuestionCoverageV1(
  value: unknown,
): PlanningArtifactParseResult<StudyQuestionCoverageV1> {
  if (!isRecord(value)) {
    return { ok: false, message: "Coverage payload must be an object." };
  }
  if (value.contract_version !== STUDY_QUESTION_COVERAGE_KIND) {
    return { ok: false, message: "Invalid contract_version for study-question-coverage@1.", field: "contract_version" };
  }
  if (!isUuid(value.study_run_id)) {
    return { ok: false, message: "study_run_id must be a UUID.", field: "study_run_id" };
  }
  if (!isSha256Hex(value.study_question_set_hash)) {
    return { ok: false, message: "study_question_set_hash must be a SHA-256 hex digest.", field: "study_question_set_hash" };
  }
  if (!Array.isArray(value.questions) || value.questions.length === 0) {
    return { ok: false, message: "questions must be a non-empty array.", field: "questions" };
  }
  const questions: StudyQuestionCoverageItemV1[] = [];
  for (const item of value.questions) {
    if (!isRecord(item)) {
      return { ok: false, message: "Invalid coverage question entry.", field: "questions" };
    }
    if (!isNonEmptyString(item.study_question_id, 128)) {
      return { ok: false, message: "study_question_id is required.", field: "questions" };
    }
    if (!EVIDENCE_COVERAGE_VALUES.includes(item.evidence_coverage as EvidenceCoverageV1)) {
      return { ok: false, message: "Invalid evidence_coverage.", field: "questions" };
    }
    if (!ANSWER_STATUS_VALUES.includes(item.answer_status as AnswerStatusV1)) {
      return { ok: false, message: "Invalid answer_status.", field: "questions" };
    }
    const coverageItem: StudyQuestionCoverageItemV1 = {
      study_question_id: item.study_question_id.trim(),
      evidence_coverage: item.evidence_coverage as EvidenceCoverageV1,
      answer_status: item.answer_status as AnswerStatusV1,
    };
    if (item.reviewed_scope !== undefined) {
      if (!isRecord(item.reviewed_scope)) {
        return { ok: false, message: "Invalid reviewed_scope.", field: "questions" };
      }
      if (!Array.isArray(item.reviewed_scope.source_document_ids) || !Array.isArray(item.reviewed_scope.document_type_ids)) {
        return { ok: false, message: "reviewed_scope requires source_document_ids and document_type_ids arrays.", field: "questions" };
      }
      coverageItem.reviewed_scope = {
        source_document_ids: item.reviewed_scope.source_document_ids.map(String),
        document_type_ids: item.reviewed_scope.document_type_ids.map(String),
        date_window:
          item.reviewed_scope.date_window && isRecord(item.reviewed_scope.date_window)
            ? {
                start: typeof item.reviewed_scope.date_window.start === "string" ? item.reviewed_scope.date_window.start : null,
                end: typeof item.reviewed_scope.date_window.end === "string" ? item.reviewed_scope.date_window.end : null,
              }
            : null,
      };
    }
    if (item.missing_evidence !== undefined) {
      if (!Array.isArray(item.missing_evidence)) {
        return { ok: false, message: "missing_evidence must be an array.", field: "questions" };
      }
      coverageItem.missing_evidence = item.missing_evidence.map(String);
    }
    if (item.supporting_assertion_ids !== undefined) {
      coverageItem.supporting_assertion_ids = (item.supporting_assertion_ids as unknown[]).map(String);
    }
    if (item.supporting_finding_ids !== undefined) {
      coverageItem.supporting_finding_ids = (item.supporting_finding_ids as unknown[]).map(String);
    }
    questions.push(coverageItem);
  }
  return {
    ok: true,
    value: {
      contract_version: STUDY_QUESTION_COVERAGE_KIND,
      study_run_id: value.study_run_id.toLowerCase(),
      study_question_set_hash: value.study_question_set_hash.toLowerCase(),
      questions,
    },
  };
}

export function planningArtifactKindForPayload(
  value: unknown,
): PlanningArtifactKindV1 | null {
  if (!isRecord(value) || typeof value.contract_version !== "string") {
    return null;
  }
  if ((PLANNING_ARTIFACT_KINDS as readonly string[]).includes(value.contract_version)) {
    return value.contract_version as PlanningArtifactKindV1;
  }
  return null;
}
