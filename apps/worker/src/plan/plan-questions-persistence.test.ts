import { describe, expect, it, vi } from "vitest";

import { parseStudyQuestionSetV1 } from "@hiveforyou/contracts/study-runs/v1";

import { sha256JsonPayload } from "../persistence/artifact-json-hash.js";
import { putStudyQuestionSetArtifact } from "../persistence/planning-artifacts.js";
import { buildStudyQuestionSet } from "./plan-questions.js";
import type { ReasoningJsonClient } from "../reasoning/types.js";

const STUDY_RUN_ID = "11111111-1111-4111-8111-111111111111";
const INTENT_ID = "22222222-2222-4222-8222-222222222222";

function mockReasoning(): ReasoningJsonClient {
  return {
    async completeJson() {
      return {
        parsed: {
          atomic_questions: [
            {
              atomic_question_id: "g1",
              text: "Which items cost the most?",
              span: { start: 0, end: 27 },
              features: { document_scope: "upload", qualifiers: "grocery_spend" },
              match_status: "none",
            },
          ],
        },
        alias: "test",
        durationMs: 1,
      };
    },
  };
}

describe("buildStudyQuestionSet persistence integration", () => {
  it("passes putStudyQuestionSetArtifact content_hash validation", async () => {
    const questionSet = await buildStudyQuestionSet({
      studyRunId: STUDY_RUN_ID,
      intentId: INTENT_ID,
      intentText: "Which items cost the most?",
      pack: null,
      reasoning: mockReasoning(),
    });

    const parsedForRow = parseStudyQuestionSetV1(questionSet);
    if (!parsedForRow.ok) {
      throw new Error(parsedForRow.message);
    }

    const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => {
      if (fn === "hive3_p1p_worker_put_run_artifact") {
        expect(args?.p_content_sha256).toBe(sha256JsonPayload(parsedForRow.value));
        return { data: { id: "art-1" }, error: null };
      }
      return { data: null, error: { message: "unexpected" } };
    });

    const persisted = await putStudyQuestionSetArtifact(
      { rpc },
      { studyRunId: STUDY_RUN_ID, payload: questionSet },
    );
    expect(persisted.content_hash).toBe(questionSet.content_hash);
    expect(persisted.pack_id).toBeUndefined();
  });
});
