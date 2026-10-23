import { describe, expect, it, vi } from "vitest";
import {
  STUDY_PLAN_KIND,
  STUDY_QUESTION_COVERAGE_KIND,
  STUDY_QUESTION_SET_KIND,
  type StudyPlanV1,
  type StudyQuestionCoverageV1,
  type StudyQuestionSetV1,
} from "@hiveforyou/contracts/study-runs/v1";

import { sha256JsonPayload } from "./artifact-json-hash.js";
import { computeStudyQuestionSetContentHash } from "./study-question-set-digest.js";
import {
  getStudyPlanArtifact,
  getStudyQuestionCoverageArtifact,
  getStudyQuestionSetArtifact,
  PlanningArtifactPersistenceError,
  putStudyPlanArtifact,
  putStudyQuestionCoverageArtifact,
  putStudyQuestionSetArtifact,
} from "./planning-artifacts.js";
import { StudyRunPersistenceError } from "./study-run-persistence.js";

const STUDY_RUN_ID = "11111111-1111-4111-8111-111111111111";
const INTENT_ID = "22222222-2222-4222-8222-222222222222";

function buildQuestionSet(overrides: Partial<StudyQuestionSetV1> = {}): StudyQuestionSetV1 {
  const { content_hash: contentHashOverride, ...restOverrides } = overrides;
  const base: Omit<StudyQuestionSetV1, "content_hash"> = {
    contract_version: STUDY_QUESTION_SET_KIND,
    study_run_id: STUDY_RUN_ID,
    intent_id: INTENT_ID,
    text_hash: "a".repeat(64),
    frozen_at: "2026-10-22T12:00:00.000Z",
    planner_version: "gate2-fixture@1",
    merged_questions: [
      {
        study_question_id: "sq-1",
        display_label: "Reading progress",
        origins: [{ atomic_question_id: "atomic-1", source: "uploader" }],
      },
    ],
    investigation_bindings: [
      {
        study_question_id: "sq-1",
        investigation_id: "goal_progress_alignment",
        priority_class: "CORE",
      },
    ],
    ...restOverrides,
  };
  const content_hash =
    typeof contentHashOverride === "string"
      ? contentHashOverride
      : computeStudyQuestionSetContentHash(base);
  return { ...base, content_hash };
}

function buildPlan(questionSetHash: string, overrides: Partial<StudyPlanV1> = {}): StudyPlanV1 {
  return {
    contract_version: STUDY_PLAN_KIND,
    study_run_id: STUDY_RUN_ID,
    study_question_set_hash: questionSetHash,
    reuse_summary: {
      assertions_reused: 0,
      findings_reused: 0,
      investigations_scheduled: 1,
      investigations_skipped: 0,
      investigations_deferred: 0,
    },
    investigation_execution_plan: [
      {
        investigation_id: "goal_progress_alignment",
        run_key: "b".repeat(64),
        execute: true,
      },
    ],
    budgets: {
      max_investigations_executed: 12,
      max_model_reasoning_calls: 4,
      max_new_sources_read: 20,
    },
    budget_outcome: "WITHIN_BUDGET",
    ...overrides,
  };
}

function buildCoverage(questionSetHash: string): StudyQuestionCoverageV1 {
  return {
    contract_version: STUDY_QUESTION_COVERAGE_KIND,
    study_run_id: STUDY_RUN_ID,
    study_question_set_hash: questionSetHash,
    questions: [
      {
        study_question_id: "sq-1",
        evidence_coverage: "NOT_ASSESSED",
        answer_status: "NOT_EVALUATED",
      },
    ],
  };
}

function artifactRow(
  kind: string,
  payload: unknown,
  overrides: Partial<{ content_sha256: string; artifact_kind: string; contract_version: string }> = {},
) {
  const content_sha256 = overrides.content_sha256 ?? sha256JsonPayload(payload);
  return {
    id: "art-1",
    study_run_id: STUDY_RUN_ID,
    hive_id: "hive-1",
    artifact_kind: overrides.artifact_kind ?? kind,
    contract_version: overrides.contract_version ?? kind,
    revision: 1,
    content_sha256,
    payload_jsonb: payload,
    storage_path: null,
    created_at: "2026-01-01T00:00:00Z",
  };
}

describe("planning artifact persistence", () => {
  it("writes and reloads all three kinds with lineage", async () => {
    const questionSet = buildQuestionSet();
    const plan = buildPlan(questionSet.content_hash);
    const coverage = buildCoverage(questionSet.content_hash);

    const store = new Map<string, ReturnType<typeof artifactRow>>();
    const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => {
      if (fn === "hive3_p1p_worker_put_run_artifact") {
        const kind = args?.p_artifact_kind as string;
        const payload = args?.p_payload_jsonb;
        const key = `${args?.p_study_run_id}:${kind}:${args?.p_revision ?? 1}`;
        const existing = store.get(key);
        const hash = args?.p_content_sha256 as string;
        if (existing && existing.content_sha256 !== hash) {
          return { data: null, error: { message: "artifact_revision_hash_conflict" } };
        }
        const row = artifactRow(kind, payload, {
          content_sha256: hash,
          artifact_kind: kind,
          contract_version: args?.p_contract_version as string,
        });
        store.set(key, row);
        return { data: row, error: null };
      }
      if (fn === "hive3_p1p_worker_get_run_artifact") {
        const key = `${args?.p_study_run_id}:${args?.p_artifact_kind}:${args?.p_revision ?? 1}`;
        const row = store.get(key);
        if (!row) {
          return { data: null, error: { message: "artifact_not_found" } };
        }
        return { data: row, error: null };
      }
      return { data: null, error: { message: "unexpected rpc" } };
    });

    const client = { rpc };
    await putStudyQuestionSetArtifact(client, { studyRunId: STUDY_RUN_ID, payload: questionSet });
    await putStudyPlanArtifact(client, { studyRunId: STUDY_RUN_ID, payload: plan });
    await putStudyQuestionCoverageArtifact(client, { studyRunId: STUDY_RUN_ID, payload: coverage });

    expect(await getStudyQuestionSetArtifact(client, { studyRunId: STUDY_RUN_ID })).toEqual(questionSet);
    expect(await getStudyPlanArtifact(client, { studyRunId: STUDY_RUN_ID })).toEqual(plan);
    expect(await getStudyQuestionCoverageArtifact(client, { studyRunId: STUDY_RUN_ID })).toEqual(coverage);
  });

  it("retries question set put idempotently with same hash", async () => {
    const questionSet = buildQuestionSet();
    const store = new Map<string, ReturnType<typeof artifactRow>>();
    const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => {
      if (fn === "hive3_p1p_worker_put_run_artifact") {
        const kind = args?.p_artifact_kind as string;
        const key = `${args?.p_study_run_id}:${kind}:${args?.p_revision ?? 1}`;
        const hash = args?.p_content_sha256 as string;
        const existing = store.get(key);
        if (existing && existing.content_sha256 !== hash) {
          return { data: null, error: { message: "artifact_revision_hash_conflict" } };
        }
        const row = artifactRow(kind, args?.p_payload_jsonb, { content_sha256: hash });
        store.set(key, row);
        return { data: row, error: null };
      }
      if (fn === "hive3_p1p_worker_get_run_artifact") {
        const key = `${args?.p_study_run_id}:${args?.p_artifact_kind}:${args?.p_revision ?? 1}`;
        const row = store.get(key);
        if (!row) {
          return { data: null, error: { message: "artifact_not_found" } };
        }
        return { data: row, error: null };
      }
      return { data: null, error: { message: "unexpected rpc" } };
    });
    const client = { rpc };

    await putStudyQuestionSetArtifact(client, { studyRunId: STUDY_RUN_ID, payload: questionSet });
    await putStudyQuestionSetArtifact(client, { studyRunId: STUDY_RUN_ID, payload: questionSet });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed question set before RPC", async () => {
    const rpc = vi.fn();
    await expect(
      putStudyQuestionSetArtifact(
        { rpc },
        { studyRunId: STUDY_RUN_ID, payload: { contract_version: STUDY_QUESTION_SET_KIND } },
      ),
    ).rejects.toBeInstanceOf(PlanningArtifactPersistenceError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects verbatim intent fields in question set", async () => {
    const rpc = vi.fn();
    const bad = { ...buildQuestionSet(), request_text: "secret intent" };
    await expect(
      putStudyQuestionSetArtifact({ rpc }, { studyRunId: STUDY_RUN_ID, payload: bad }),
    ).rejects.toBeInstanceOf(PlanningArtifactPersistenceError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects study plan when question set hash does not match", async () => {
    const questionSet = buildQuestionSet();
    const qsRow = artifactRow(STUDY_QUESTION_SET_KIND, questionSet);
    const rpc = vi.fn(async (fn: string) => {
      if (fn === "hive3_p1p_worker_get_run_artifact") {
        return { data: qsRow, error: null };
      }
      return { data: null, error: null };
    });
    const plan = buildPlan("f".repeat(64));
    await expect(
      putStudyPlanArtifact({ rpc }, { studyRunId: STUDY_RUN_ID, payload: plan }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(PlanningArtifactPersistenceError);
      expect((err as PlanningArtifactPersistenceError).errorCode).toBe("INVALID_REQUEST");
      return true;
    });
  });

  it("rejects study plan when question set artifact is missing", async () => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === "hive3_p1p_worker_get_run_artifact") {
        return { data: null, error: { message: "artifact_not_found" } };
      }
      return { data: null, error: null };
    });
    const plan = buildPlan("a".repeat(64));
    await expect(
      putStudyPlanArtifact({ rpc }, { studyRunId: STUDY_RUN_ID, payload: plan }),
    ).rejects.toBeInstanceOf(PlanningArtifactPersistenceError);
  });

  it("surfaces hash conflict from RPC boundary", async () => {
    const questionSet = buildQuestionSet();
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "artifact_revision_hash_conflict" },
    });
    await expect(
      putStudyQuestionSetArtifact({ rpc }, { studyRunId: STUDY_RUN_ID, payload: questionSet }),
    ).rejects.toBeInstanceOf(StudyRunPersistenceError);
  });

  it("rejects corrupted stored artifact digest on read", async () => {
    const questionSet = buildQuestionSet();
    const row = artifactRow(STUDY_QUESTION_SET_KIND, questionSet, { content_sha256: "c".repeat(64) });
    const rpc = vi.fn().mockResolvedValue({ data: row, error: null });
    await expect(
      getStudyQuestionSetArtifact({ rpc }, { studyRunId: STUDY_RUN_ID }),
    ).rejects.toBeInstanceOf(PlanningArtifactPersistenceError);
  });

  it("rejects question set with wrong content_hash before RPC", async () => {
    const questionSet = buildQuestionSet({ content_hash: "d".repeat(64) });
    const rpc = vi.fn();
    await expect(
      putStudyQuestionSetArtifact({ rpc }, { studyRunId: STUDY_RUN_ID, payload: questionSet }),
    ).rejects.toBeInstanceOf(PlanningArtifactPersistenceError);
    expect(rpc).not.toHaveBeenCalled();
  });
});
