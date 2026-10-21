export const StudyRunStatus = {
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type StudyRunStatus = (typeof StudyRunStatus)[keyof typeof StudyRunStatus];

export const StudyRunStage = {
  ENQUEUE: "enqueue",
  LOAD_SOURCES: "load_sources",
  PLAN_SCHEMA: "plan_schema",
  EXTRACT: "extract",
  VERIFY: "verify",
  MERGE_STUDY: "merge_study",
  ANALYZE: "analyze",
  REPORT: "report",
  FINALIZE: "finalize",
} as const;

export type StudyRunStage = (typeof StudyRunStage)[keyof typeof StudyRunStage];
