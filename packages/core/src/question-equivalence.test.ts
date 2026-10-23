import { describe, expect, it } from "vitest";

import { equivalenceFeaturesAlign } from "./question-equivalence.js";

describe("equivalenceFeaturesAlign", () => {
  it("rejects merge when population differs (narrow vs broad)", () => {
    const narrow = {
      subject: null,
      time_period: null,
      population: "reading",
      document_scope: "upload",
      qualifiers: "fluency",
    };
    const broad = {
      subject: null,
      time_period: "overall",
      population: "overall",
      document_scope: "upload",
      qualifiers: "progress_overall",
    };
    expect(equivalenceFeaturesAlign(narrow, broad).can_merge).toBe(false);
  });
});
