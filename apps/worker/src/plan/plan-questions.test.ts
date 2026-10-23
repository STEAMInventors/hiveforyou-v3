import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { parseDomainPackManifestV3 } from "@hiveforyou/contracts/domain-packs/v3";
import { validateDomainPackManifestV3 } from "@hiveforyou/core";

import { selectCatalogQuestions } from "./catalog-selection.js";
import { buildStudyQuestionSet } from "./plan-questions.js";
import type { ReasoningJsonClient } from "../reasoning/types.js";

const repoRoot = join(process.cwd(), "../..");
const candidatePath = join(
  repoRoot,
  "docs/design/p2.2-dp.d/iep-manifest@2.CANDIDATE.json",
);

function loadCandidate() {
  const bytes = readFileSync(candidatePath, "utf8");
  const parsed = parseDomainPackManifestV3(JSON.parse(bytes));
  if (!parsed.ok) {
    throw new Error(parsed.message);
  }
  validateDomainPackManifestV3(parsed.value, { manifestBytes: Buffer.byteLength(bytes, "utf8") });
  return parsed.value;
}

function mockReasoning(atomics: Record<string, unknown>[]): ReasoningJsonClient {
  return {
    async completeJson() {
      return {
        parsed: { atomic_questions: atomics },
        alias: "test",
        durationMs: 1,
      };
    },
  };
}

describe("IEP @3 candidate manifest", () => {
  it("validates the design candidate file", () => {
    expect(loadCandidate().pack_id).toBe("iep");
  });
});

describe("catalog selection", () => {
  it("does not select Q04 on pack pin alone", () => {
    const manifest = loadCandidate();
    const selected = selectCatalogQuestions({
      manifest,
      intentText: "How is my child doing on the current IEP?",
      proposedCatalogIds: new Set(),
    });
    expect(selected.some((q) => q.question_id === "Q04")).toBe(false);
    expect(selected.some((q) => q.question_id === "Q01")).toBe(true);
  });

  it("selects Q04 when intent signals professional review", () => {
    const manifest = loadCandidate();
    const selected = selectCatalogQuestions({
      manifest,
      intentText: "Review discrepancies and delivery evidence gaps as an advocate.",
      proposedCatalogIds: new Set(),
    });
    expect(selected.some((q) => q.question_id === "Q04")).toBe(true);
  });
});

describe("buildStudyQuestionSet", () => {
  it("keeps narrow and broad progress questions distinct (§12.2)", async () => {
    const manifest = loadCandidate();
    const questionSet = await buildStudyQuestionSet({
      studyRunId: "11111111-1111-4111-8111-111111111111",
      intentId: "22222222-2222-4222-8222-222222222222",
      intentText:
        "Is my child on track for reading fluency? How is my child progressing overall?",
      pack: { manifest, digest: "abc" },
      reasoning: mockReasoning([
        {
          atomic_question_id: "a1",
          text: "Is my child on track for reading fluency?",
          span: { start: 0, end: 44 },
          features: {
            population: "reading",
            qualifiers: "fluency_on_track",
            document_scope: "upload",
          },
          proposed_catalog_question_id: "Q02",
          match_status: "ambiguous",
        },
        {
          atomic_question_id: "a2",
          text: "How is my child progressing overall?",
          span: { start: 45, end: 84 },
          features: {
            population: "overall",
            qualifiers: "progress_overall",
            document_scope: "upload",
            time_period: "overall",
          },
          proposed_catalog_question_id: "Q02",
          match_status: "proposed",
        },
      ]),
    });

    const uploaderMerged = questionSet.merged_questions.filter((q) =>
      q.origins.some((origin) => origin.source === "uploader"),
    );
    expect(uploaderMerged.length).toBeGreaterThanOrEqual(2);
    expect(new Set(uploaderMerged.map((q) => q.study_question_id)).size).toBeGreaterThanOrEqual(2);
    expect(
      uploaderMerged.some((q) => q.display_label.toLowerCase().includes("reading")),
    ).toBe(true);
  });

  it("supports pack-free dynamic questions (§12.8)", async () => {
    const questionSet = await buildStudyQuestionSet({
      studyRunId: "11111111-1111-4111-8111-111111111111",
      intentId: "22222222-2222-4222-8222-222222222222",
      intentText: "Which items cost the most across these receipts?",
      pack: null,
      reasoning: mockReasoning([
        {
          atomic_question_id: "g1",
          text: "Which items cost the most across these receipts?",
          span: { start: 0, end: 48 },
          features: { document_scope: "upload", qualifiers: "grocery_spend" },
          match_status: "none",
        },
      ]),
    });
    expect(questionSet.pack_id).toBeUndefined();
    expect(questionSet.merged_questions).toHaveLength(1);
    expect(questionSet.investigation_bindings).toHaveLength(0);
  });
});
