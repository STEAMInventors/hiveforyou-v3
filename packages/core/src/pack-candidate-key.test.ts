import { describe, expect, it } from "vitest";

import { computePackCandidateKey } from "./pack-candidate-key.js";

describe("computePackCandidateKey", () => {
  it("is stable for the same candidate identity", () => {
    const input = {
      record_type_id: "document_header",
      record_local_id: "r1",
      parent_record_local_id: null,
      segment_index: 0,
      fact_id: "document_header.title",
    };
    expect(computePackCandidateKey(input)).toBe(computePackCandidateKey(input));
    expect(computePackCandidateKey(input)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("changes when parent or segment identity changes", () => {
    const base = {
      record_type_id: "iep.goal",
      record_local_id: "g1",
      parent_record_local_id: "p1",
      segment_index: 0,
      fact_id: "iep.goal.description",
    };
    expect(computePackCandidateKey(base)).not.toBe(
      computePackCandidateKey({ ...base, parent_record_local_id: "p2" }),
    );
    expect(computePackCandidateKey(base)).not.toBe(
      computePackCandidateKey({ ...base, segment_index: 1 }),
    );
  });
});
