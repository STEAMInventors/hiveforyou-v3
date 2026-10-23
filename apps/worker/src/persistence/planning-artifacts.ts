import { ErrorCode } from "@hiveforyou/contracts/errors/v1";
import type { RunArtifactV1 } from "@hiveforyou/contracts/study-runs/v1";
import {
  parseStudyPlanV1,
  parseStudyQuestionCoverageV1,
  parseStudyQuestionSetV1,
  STUDY_PLAN_KIND,
  STUDY_QUESTION_COVERAGE_KIND,
  STUDY_QUESTION_SET_KIND,
  type StudyPlanV1,
  type StudyQuestionCoverageV1,
  type StudyQuestionSetV1,
} from "@hiveforyou/contracts/study-runs/v1";

import { putRunArtifactIdempotent } from "./artifact-idempotent-put.js";
import { sha256JsonPayload } from "./artifact-json-hash.js";
import {
  StudyRunPersistenceError,
  workerGetRunArtifact,
  type StudyRunPersistenceClient,
} from "./study-run-persistence.js";

/** Semantic digest for `study-question-set@1` (`content_hash`; excludes the hash field itself). */
export function computeStudyQuestionSetContentHash(
  payload: Omit<StudyQuestionSetV1, "content_hash">,
): string {
  return sha256JsonPayload(payload);
}

export class PlanningArtifactPersistenceError extends Error {
  constructor(
    message: string,
    readonly errorCode: string = ErrorCode.INVALID_REQUEST,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PlanningArtifactPersistenceError";
  }
}

function assertStudyRunBinding(payloadStudyRunId: string, studyRunId: string): void {
  if (payloadStudyRunId !== studyRunId.toLowerCase()) {
    throw new PlanningArtifactPersistenceError("Artifact study_run_id does not match persistence target.");
  }
}

function questionSetSemanticDigest(payload: StudyQuestionSetV1): string {
  const { content_hash: _ignored, ...rest } = payload;
  return sha256JsonPayload(rest);
}

function assertQuestionSetContentHash(payload: StudyQuestionSetV1): void {
  const computed = questionSetSemanticDigest(payload);
  if (computed !== payload.content_hash.toLowerCase()) {
    throw new PlanningArtifactPersistenceError("content_hash does not match canonical question set digest.");
  }
}

function assertStoredArtifactIntegrity(row: RunArtifactV1, expectedKind: string): void {
  if (row.artifact_kind !== expectedKind || row.contract_version !== expectedKind) {
    throw new PlanningArtifactPersistenceError("Stored artifact kind or contract_version mismatch.");
  }
  const payloadHash = sha256JsonPayload(row.payload_jsonb);
  if (payloadHash !== row.content_sha256.toLowerCase()) {
    throw new PlanningArtifactPersistenceError("Stored artifact content_sha256 does not match payload.");
  }
}

async function loadQuestionSetArtifactHash(
  client: StudyRunPersistenceClient,
  studyRunId: string,
  revision: number,
): Promise<string> {
  let row: RunArtifactV1;
  try {
    row = await workerGetRunArtifact(client, {
      studyRunId,
      artifactKind: STUDY_QUESTION_SET_KIND,
      revision,
    });
  } catch (error) {
    if (error instanceof StudyRunPersistenceError && error.boundary?.error_code === "NOT_FOUND") {
      throw new PlanningArtifactPersistenceError(
        "Question set artifact is required before persisting dependent planning artifacts.",
        ErrorCode.INVALID_REQUEST,
        error,
      );
    }
    throw error;
  }
  assertStoredArtifactIntegrity(row, STUDY_QUESTION_SET_KIND);
  const parsed = parseStudyQuestionSetV1(row.payload_jsonb);
  if (!parsed.ok) {
    throw new PlanningArtifactPersistenceError("Stored question set artifact is invalid.");
  }
  assertQuestionSetContentHash(parsed.value);
  return parsed.value.content_hash.toLowerCase();
}

function validateQuestionSetForWrite(payload: StudyQuestionSetV1, studyRunId: string): void {
  assertStudyRunBinding(payload.study_run_id, studyRunId);
  assertQuestionSetContentHash(payload);
}

async function assertQuestionSetLineage(
  client: StudyRunPersistenceClient,
  studyRunId: string,
  studyQuestionSetHash: string,
  revision: number,
): Promise<void> {
  const expected = await loadQuestionSetArtifactHash(client, studyRunId, revision);
  if (studyQuestionSetHash.toLowerCase() !== expected) {
    throw new PlanningArtifactPersistenceError(
      "study_question_set_hash does not match persisted question set artifact.",
    );
  }
}

export async function putStudyQuestionSetArtifact(
  client: StudyRunPersistenceClient,
  input: { studyRunId: string; payload: unknown; revision?: number; correlationId?: string },
): Promise<StudyQuestionSetV1> {
  void input.correlationId;
  const parsed = parseStudyQuestionSetV1(input.payload);
  if (!parsed.ok) {
    throw new PlanningArtifactPersistenceError(parsed.message, ErrorCode.INVALID_REQUEST);
  }
  validateQuestionSetForWrite(parsed.value, input.studyRunId);
  await putRunArtifactIdempotent(client, {
    studyRunId: input.studyRunId,
    artifactKind: STUDY_QUESTION_SET_KIND,
    contractVersion: STUDY_QUESTION_SET_KIND,
    payload: parsed.value,
    revision: input.revision ?? 1,
  });
  return parsed.value;
}

export async function getStudyQuestionSetArtifact(
  client: StudyRunPersistenceClient,
  input: { studyRunId: string; revision?: number },
): Promise<StudyQuestionSetV1> {
  const row = await workerGetRunArtifact(client, {
    studyRunId: input.studyRunId,
    artifactKind: STUDY_QUESTION_SET_KIND,
    revision: input.revision ?? 1,
  });
  assertStoredArtifactIntegrity(row, STUDY_QUESTION_SET_KIND);
  const parsed = parseStudyQuestionSetV1(row.payload_jsonb);
  if (!parsed.ok) {
    throw new PlanningArtifactPersistenceError(parsed.message, ErrorCode.INVALID_REQUEST);
  }
  assertStudyRunBinding(parsed.value.study_run_id, input.studyRunId);
  assertQuestionSetContentHash(parsed.value);
  return parsed.value;
}

export async function putStudyPlanArtifact(
  client: StudyRunPersistenceClient,
  input: { studyRunId: string; payload: unknown; revision?: number; correlationId?: string },
): Promise<StudyPlanV1> {
  void input.correlationId;
  const revision = input.revision ?? 1;
  const parsed = parseStudyPlanV1(input.payload);
  if (!parsed.ok) {
    throw new PlanningArtifactPersistenceError(parsed.message, ErrorCode.INVALID_REQUEST);
  }
  assertStudyRunBinding(parsed.value.study_run_id, input.studyRunId);
  await assertQuestionSetLineage(
    client,
    input.studyRunId,
    parsed.value.study_question_set_hash,
    revision,
  );
  await putRunArtifactIdempotent(client, {
    studyRunId: input.studyRunId,
    artifactKind: STUDY_PLAN_KIND,
    contractVersion: STUDY_PLAN_KIND,
    payload: parsed.value,
    revision,
  });
  return parsed.value;
}

export async function getStudyPlanArtifact(
  client: StudyRunPersistenceClient,
  input: { studyRunId: string; revision?: number },
): Promise<StudyPlanV1> {
  const revision = input.revision ?? 1;
  const row = await workerGetRunArtifact(client, {
    studyRunId: input.studyRunId,
    artifactKind: STUDY_PLAN_KIND,
    revision,
  });
  assertStoredArtifactIntegrity(row, STUDY_PLAN_KIND);
  const parsed = parseStudyPlanV1(row.payload_jsonb);
  if (!parsed.ok) {
    throw new PlanningArtifactPersistenceError(parsed.message, ErrorCode.INVALID_REQUEST);
  }
  assertStudyRunBinding(parsed.value.study_run_id, input.studyRunId);
  await assertQuestionSetLineage(
    client,
    input.studyRunId,
    parsed.value.study_question_set_hash,
    revision,
  );
  return parsed.value;
}

export async function putStudyQuestionCoverageArtifact(
  client: StudyRunPersistenceClient,
  input: { studyRunId: string; payload: unknown; revision?: number; correlationId?: string },
): Promise<StudyQuestionCoverageV1> {
  void input.correlationId;
  const revision = input.revision ?? 1;
  const parsed = parseStudyQuestionCoverageV1(input.payload);
  if (!parsed.ok) {
    throw new PlanningArtifactPersistenceError(parsed.message, ErrorCode.INVALID_REQUEST);
  }
  assertStudyRunBinding(parsed.value.study_run_id, input.studyRunId);
  await assertQuestionSetLineage(
    client,
    input.studyRunId,
    parsed.value.study_question_set_hash,
    revision,
  );
  await putRunArtifactIdempotent(client, {
    studyRunId: input.studyRunId,
    artifactKind: STUDY_QUESTION_COVERAGE_KIND,
    contractVersion: STUDY_QUESTION_COVERAGE_KIND,
    payload: parsed.value,
    revision,
  });
  return parsed.value;
}

export async function getStudyQuestionCoverageArtifact(
  client: StudyRunPersistenceClient,
  input: { studyRunId: string; revision?: number },
): Promise<StudyQuestionCoverageV1> {
  const revision = input.revision ?? 1;
  const row = await workerGetRunArtifact(client, {
    studyRunId: input.studyRunId,
    artifactKind: STUDY_QUESTION_COVERAGE_KIND,
    revision,
  });
  assertStoredArtifactIntegrity(row, STUDY_QUESTION_COVERAGE_KIND);
  const parsed = parseStudyQuestionCoverageV1(row.payload_jsonb);
  if (!parsed.ok) {
    throw new PlanningArtifactPersistenceError(parsed.message, ErrorCode.INVALID_REQUEST);
  }
  assertStudyRunBinding(parsed.value.study_run_id, input.studyRunId);
  await assertQuestionSetLineage(
    client,
    input.studyRunId,
    parsed.value.study_question_set_hash,
    revision,
  );
  return parsed.value;
}
