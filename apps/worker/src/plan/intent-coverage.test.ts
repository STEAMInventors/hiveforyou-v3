import { describe, expect, it } from "vitest";

import type { ExtractionSchemaFieldV1 } from "@hiveforyou/contracts/extraction/v1";

import {
  intentNeedsSupplementalFields,
  materialUncoveredIntentTokens,
  uncoveredIntentTokens,
} from "./intent-coverage.js";

const iepInitialFields: ExtractionSchemaFieldV1[] = [
  {
    field_key: "annual_goals",
    title: "Annual IEP goals",
    description: "Measurable annual goals",
    value_type: "array",
    evidence_required: true,
    reusable: false,
    required_for_intent: false,
  },
  {
    field_key: "iep_meeting_date",
    title: "IEP meeting date",
    value_type: "date",
    evidence_required: true,
    reusable: false,
    required_for_intent: false,
  },
];

describe("intent coverage", () => {
  it("treats a single material uncovered term as needing supplemental fields", () => {
    expect(
      intentNeedsSupplementalFields("Annual goals and homeschool", iepInitialFields),
    ).toBe(true);
    expect(materialUncoveredIntentTokens("Annual goals and homeschool", iepInitialFields)).toEqual([
      "homeschool",
    ]);
  });

  it("does not treat contextual fillers as material requirements", () => {
    expect(
      uncoveredIntentTokens("Prepare for my child's IEP meeting and annual goals", iepInitialFields),
    ).toContain("child");
    expect(
      intentNeedsSupplementalFields(
        "Prepare for my child's IEP meeting and annual goals",
        iepInitialFields,
      ),
    ).toBe(false);
    expect(
      intentNeedsSupplementalFields("Summarize progress on IEP goals this term", [
        {
          field_key: "goal_progress",
          title: "Goal progress summaries",
          value_type: "array",
          evidence_required: true,
          reusable: false,
          required_for_intent: false,
        },
      ]),
    ).toBe(false);
  });
});
