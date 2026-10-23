import { describe, expect, it } from "vitest";

import { STUDY_QUESTION_SET_KIND } from "@hiveforyou/contracts/study-runs/v1";

import { compileStudyPlanAndCoverage } from "./compile-study-plan.js";

const baseQuestionSet = {
  contract_version: STUDY_QUESTION_SET_KIND,
  study_run_id: "11111111-1111-4111-8111-111111111111",
  intent_id: "22222222-2222-4222-8222-222222222222",
  text_hash: "abc",
  frozen_at: new Date().toISOString(),
  planner_version: "p2.2-dp.i@1",
  content_hash: "def",
  merged_questions: [
    {
      study_question_id: "33333333-3333-4333-8333-333333333333",
      display_label: "Delivery review",
      catalog_question_id: "Q04",
      origins: [{ atomic_question_id: "Q04", source: "catalog" as const }],
    },
  ],
  investigation_bindings: [
    {
      study_question_id: "33333333-3333-4333-8333-333333333333",
      investigation_id: "service_commitment_versus_delivery",
      priority_class: "CORE" as const,
    },
  ],
};

describe("compileStudyPlanAndCoverage", () => {
  it("does not schedule service delivery comparison without delivery logs (§12.6)", () => {
    const { plan } = compileStudyPlanAndCoverage({
      questionSet: baseQuestionSet,
      pack: null,
      classifiedDocuments: [{ source_document_id: "doc-1", document_type_id: "iep.plan" }],
    });
    const row = plan.investigation_execution_plan.find(
      (entry) => entry.investigation_id === "service_commitment_versus_delivery",
    );
    expect(row?.execute).toBe(false);
    expect(row?.skip_reason).toBe("MISSING_SERVICE_DELIVERY_OBSERVATION");
  });
});
