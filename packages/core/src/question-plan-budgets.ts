export type QuestionPlanBudgetsV1 = {
  max_investigations_executed: number;
  max_model_reasoning_calls: number;
  max_new_sources_read: number;
};

const DEFAULTS: QuestionPlanBudgetsV1 = {
  max_investigations_executed: 12,
  max_model_reasoning_calls: 16,
  max_new_sources_read: 64,
};

function parsePositiveInt(raw: string | undefined, fallback: number, max: number): number {
  if (!raw?.trim()) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
}

export function parseQuestionPlanBudgets(env: NodeJS.ProcessEnv = process.env): QuestionPlanBudgetsV1 {
  return {
    max_investigations_executed: parsePositiveInt(
      env.WORKER_QUESTION_PLAN_MAX_INVESTIGATIONS,
      DEFAULTS.max_investigations_executed,
      64,
    ),
    max_model_reasoning_calls: parsePositiveInt(
      env.WORKER_QUESTION_PLAN_MAX_REASONING_CALLS,
      DEFAULTS.max_model_reasoning_calls,
      128,
    ),
    max_new_sources_read: parsePositiveInt(
      env.WORKER_QUESTION_PLAN_MAX_NEW_SOURCES_READ,
      DEFAULTS.max_new_sources_read,
      256,
    ),
  };
}
