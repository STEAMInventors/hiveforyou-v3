import { describe, expect, it, vi } from "vitest";
import {
  STUDY_QUESTION_SET_KIND,
  type StudyQuestionSetV1,
} from "@hiveforyou/contracts/study-runs/v1";

import {
  computeStudyQuestionSetContentHash,
  finalizeStudyQuestionSet,
  normalizeStudyQuestionSetForContentHash,
  studyQuestionSetSemanticDigest,
} from "./study-question-set-digest.js";
import { PlanningArtifactPersistenceError, putStudyQuestionSetArtifact } from "./planning-artifacts.js";

const STUDY_RUN_ID = "11111111-1111-4111-8111-111111111111";
const INTENT_ID = "22222222-2222-4222-8222-222222222222";

function basePayload(): Omit<StudyQuestionSetV1, "content_hash"> {
  return {
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
        catalog_question_id: null,
      },
    ],
    investigation_bindings: [],
    deduplication_log: [],
    pack_id: null,
    pack_version: null,
  };
}

describe("study-question-set content_hash digest", () => {
  it("omits null optional fields to match contract parse", () => {
    const normalized = normalizeStudyQuestionSetForContentHash(basePayload());
    expect(normalized.pack_id).toBeUndefined();
    expect(normalized.merged_questions[0]?.catalog_question_id).toBeUndefined();
  });

  it("matches hash after property reorder on input", () => {
    const payload = basePayload();
    const hashA = computeStudyQuestionSetContentHash(payload);
    const reordered = {
      investigation_bindings: payload.investigation_bindings,
      merged_questions: payload.merged_questions,
      deduplication_log: payload.deduplication_log,
      frozen_at: payload.frozen_at,
      intent_id: payload.intent_id,
      planner_version: payload.planner_version,
      study_run_id: payload.study_run_id,
      text_hash: payload.text_hash,
      contract_version: payload.contract_version,
      pack_id: null,
      pack_version: null,
    };
    expect(computeStudyQuestionSetContentHash(reordered)).toBe(hashA);
  });

  it("finalize attaches content_hash validated by semantic digest", () => {
    const finalized = finalizeStudyQuestionSet(basePayload());
    expect(studyQuestionSetSemanticDigest(finalized)).toBe(finalized.content_hash);
  });

  it("rejects tampered content_hash at persistence boundary", async () => {
    const finalized = finalizeStudyQuestionSet(basePayload());
    const tampered: StudyQuestionSetV1 = {
      ...finalized,
      merged_questions: [
        {
          ...finalized.merged_questions[0]!,
          display_label: "Tampered label",
        },
      ],
    };

    const rpc = vi.fn();
    const client = { rpc };
    await expect(
      putStudyQuestionSetArtifact(client, { studyRunId: STUDY_RUN_ID, payload: tampered }),
    ).rejects.toThrow(PlanningArtifactPersistenceError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("accepts finalized payload at persistence boundary", async () => {
    const finalized = finalizeStudyQuestionSet(basePayload());
    const rpc = vi.fn(async (fn: string) => {
      if (fn === "hive3_p1p_worker_put_run_artifact") {
        return { data: { id: "row-1" }, error: null };
      }
      return { data: null, error: { message: "unexpected" } };
    });
    await putStudyQuestionSetArtifact({ rpc }, { studyRunId: STUDY_RUN_ID, payload: finalized });
    expect(rpc).toHaveBeenCalled();
  });
});
