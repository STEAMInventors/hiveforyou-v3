import { describe, expect, it } from "vitest";

import { parsePackExtractionValidationV1 } from "@hiveforyou/contracts/pack-extraction/v1";

import { loadIep200 } from "./pack-extraction.fixture.js";
import {
  normalizeQuoteText,
  validatePackExtractionOutput,
  type PackExtractionValidationContext,
} from "./validate-extraction.js";

const { compiled, documentTypeIds } = loadIep200();

const PAGE_1 = "Individualized Education Program\nStudent: Jordan Lee\nAnnual review meeting";
const PAGE_2 = "Services\nSpeech-language therapy 30 minutes weekly\nGroup delivery";

function ctx(overrides: Partial<PackExtractionValidationContext> = {}): PackExtractionValidationContext {
  return {
    catalog: compiled.catalog.catalog,
    documentTypeIds,
    promptDigest: compiled.prompt_digest,
    sourceRefId: "src-1",
    window: { page_start: 1, page_end: 2 },
    pageText: new Map([
      [1, PAGE_1],
      [2, PAGE_2],
    ]),
    finishReason: "stop",
    ...overrides,
  };
}

function observed(value: unknown, page: number, quote: string) {
  return { status: "OBSERVED", value, evidence: [{ page_number: page, exact_quote: quote }] };
}

function output(records: unknown[], classification?: Record<string, unknown>) {
  return {
    contract_version: "pack-extraction-output@1",
    prompt_digest: compiled.prompt_digest,
    source_ref_id: "src-1",
    classification: classification ?? {
      status: "CLASSIFIED",
      primary_document_type_id: "iep.plan",
      candidates: [{ document_type_id: "iep.plan" }],
    },
    records,
    missing_facts: [],
    ambiguities: [],
  };
}

function header(facts: Record<string, unknown>, localId = "r1", segment = 0) {
  return { record_type_id: "document_header", record_local_id: localId, segment_index: segment, facts };
}

describe("validatePackExtractionOutput — accepted path", () => {
  it("accepts catalog facts anchored to Reader page text", () => {
    const result = validatePackExtractionOutput(
      output([
        header({
          "document_header.title": observed("Individualized Education Program", 1, "Individualized Education Program"),
          "document_header.effective_end": { status: "NOT_FOUND" },
        }),
      ]),
      ctx(),
    );
    expect(result.usable).toBe(true);
    if (!result.usable) return;
    expect(result.validation.disposition).toBe("VALID");
    expect(result.classification).toEqual({
      status: "CLASSIFIED",
      primary_document_type_id: "iep.plan",
      document_type_ids: ["iep.plan"],
    });
    expect(result.acceptedFacts).toHaveLength(2);
    expect(result.acceptedFacts[1]).toMatchObject({
      fact_id: "document_header.title",
      record_type_id: "document_header",
      status: "OBSERVED",
      evidence: [{ page_number: 1, exact_quote: "Individualized Education Program" }],
    });
    expect(result.acceptedFacts[0]).toMatchObject({ fact_id: "document_header.effective_end", evidence: [] });
    expect(parsePackExtractionValidationV1(result.validation).ok).toBe(true);
  });

  it("matches quotes after whitespace and Unicode-compatibility normalization", () => {
    const result = validatePackExtractionOutput(
      output([header({ "document_header.title": observed("IEP", 1, "Individualized   Education\nProgram") })]),
      ctx(),
    );
    expect(result.usable && result.validation.disposition).toBe("VALID");
    expect(normalizeQuoteText("ﬁle\u00a0 a")).toBe("file a");
  });

  it("keeps only the valid anchors when some anchors fail", () => {
    const result = validatePackExtractionOutput(
      output([
        header({
          "document_header.title": {
            status: "OBSERVED",
            value: "IEP",
            evidence: [
              { page_number: 1, exact_quote: "Individualized Education Program" },
              { page_number: 2, exact_quote: "not on the page" },
            ],
          },
        }),
      ]),
      ctx(),
    );
    expect(result.usable).toBe(true);
    if (!result.usable) return;
    expect(result.validation.disposition).toBe("VALID");
    expect(result.acceptedFacts[0]!.evidence).toEqual([
      { page_number: 1, exact_quote: "Individualized Education Program" },
    ]);
  });

  it("validates child records and records the parent link", () => {
    const result = validatePackExtractionOutput(
      output([
        {
          record_type_id: "goal",
          record_local_id: "g1",
          segment_index: 0,
          facts: { "goal.area": observed("communication", 2, "Speech-language therapy") },
          children: [
            {
              record_type_id: "short_term_objective",
              record_local_id: "o1",
              segment_index: 0,
              facts: { "short_term_objective.statement": observed("weekly", 2, "30 minutes weekly") },
            },
          ],
        },
      ]),
      ctx(),
    );
    expect(result.usable).toBe(true);
    if (!result.usable) return;
    expect(result.acceptedFacts.find((f) => f.record_local_id === "o1")).toMatchObject({
      parent_record_local_id: "g1",
    });
  });
});

describe("validatePackExtractionOutput — per-candidate rejections preserve valid facts", () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ["UNKNOWN_FACT_ID", { "document_header.invented": observed("x", 1, "Student") }, "UNKNOWN_FACT_ID"],
    ["FACT_NOT_IN_RECORD_TYPE", { "student.name": observed("Jordan Lee", 1, "Jordan Lee") }, "FACT_NOT_IN_RECORD_TYPE"],
    ["ENUM_INVALID", { "document_header.author_role": observed("principal", 1, "Student") }, "ENUM_INVALID"],
    ["TYPE_MISMATCH", { "document_header.title": observed(42, 1, "Student") }, "TYPE_MISMATCH"],
    [
      "MISSING_EVIDENCE",
      { "document_header.title": { status: "OBSERVED", value: "IEP", evidence: [] } },
      "MISSING_EVIDENCE",
    ],
    ["PAGE_OUT_OF_RANGE", { "document_header.title": observed("IEP", 7, "Student") }, "PAGE_OUT_OF_RANGE"],
    [
      "QUOTE_NOT_IN_PAGE",
      { "document_header.title": observed("IEP", 1, "Behavior Intervention Plan") },
      "QUOTE_NOT_IN_PAGE",
    ],
    [
      "VALUE_WITH_NON_OBSERVED_STATUS",
      { "document_header.title": { status: "NOT_FOUND", value: "IEP" } },
      "VALUE_WITH_NON_OBSERVED_STATUS",
    ],
  ];

  for (const [name, badFacts, reason] of cases) {
    it(`rejects ${name} and keeps the sibling fact`, () => {
      const result = validatePackExtractionOutput(
        output([
          header({
            ...badFacts,
            "document_header.subtype": observed("annual", 1, "Annual review meeting"),
          }),
        ]),
        ctx(),
      );
      expect(result.usable).toBe(true);
      if (!result.usable) return;
      expect(result.validation.disposition).toBe("VALID_WITH_REJECTIONS");
      expect(result.validation.rejections).toEqual([
        { path: `/records/0/facts/${Object.keys(badFacts)[0]}`, reason_code: reason },
      ]);
      expect(result.validation.counts.facts_rejected).toBe(1);
      expect(result.acceptedFacts.map((f) => f.fact_id)).toEqual(["document_header.subtype"]);
    });
  }

  it("rejects unknown record types, invalid segments and duplicate non-repeatable records", () => {
    const result = validatePackExtractionOutput(
      output([
        { record_type_id: "invented_record", record_local_id: "x1", segment_index: 0, facts: {} },
        header({ "document_header.title": observed("IEP", 1, "Individualized Education Program") }, "r1", 1),
        { record_type_id: "student", record_local_id: "s1", segment_index: 0, facts: { "student.name": observed("Jordan Lee", 1, "Jordan Lee") } },
        { record_type_id: "student", record_local_id: "s2", segment_index: 0, facts: { "student.name": observed("Jordan", 1, "Jordan") } },
      ]),
      ctx(),
    );
    expect(result.usable).toBe(true);
    if (!result.usable) return;
    expect(result.validation.rejections).toEqual([
      { path: "/records/0", reason_code: "UNKNOWN_RECORD_TYPE" },
      { path: "/records/1", reason_code: "SEGMENT_REF_INVALID" },
      { path: "/records/3", reason_code: "DUPLICATE_NON_REPEATABLE_RECORD" },
    ]);
    expect(result.validation.counts).toEqual({
      records: 1,
      facts_accepted: 1,
      facts_rejected: 0,
      records_rejected: 3,
    });
    expect(result.acceptedFacts.map((f) => f.record_local_id)).toEqual(["s1"]);
  });
});

describe("validatePackExtractionOutput — document-level unusable outcomes", () => {
  const good = output([header({ "document_header.title": observed("IEP", 1, "Individualized Education Program") })]);

  it("treats finish_reason=length as output_truncated", () => {
    const result = validatePackExtractionOutput(good, ctx({ finishReason: "length" }));
    expect(result).toMatchObject({ usable: false, reason: "output_truncated" });
    expect(result.validation.disposition).toBe("UNUSABLE");
  });

  it("treats non-object output as output_not_json", () => {
    expect(validatePackExtractionOutput("not json", ctx())).toMatchObject({ usable: false, reason: "output_not_json" });
    expect(validatePackExtractionOutput([good], ctx())).toMatchObject({ usable: false, reason: "output_not_json" });
  });

  it("treats a wrong prompt digest, source ref or contract as contract_mismatch", () => {
    for (const patch of [
      { prompt_digest: `sha256:${"0".repeat(64)}` },
      { source_ref_id: "src-2" },
      { contract_version: "pack-extraction-output@2" },
      { records: {} },
    ]) {
      expect(validatePackExtractionOutput({ ...good, ...patch }, ctx())).toMatchObject({
        usable: false,
        reason: "contract_mismatch",
      });
    }
  });

  it("treats types outside the Pack or overlapping compound segments as classification_invalid", () => {
    const unknownType = output([], {
      status: "CLASSIFIED",
      primary_document_type_id: "grocery.receipt",
      candidates: [{ document_type_id: "grocery.receipt" }],
    });
    const overlapping = output([], {
      status: "COMPOUND",
      candidates: [{ document_type_id: "iep.plan" }],
      segments: [
        { document_type_id: "iep.plan", page_start: 1, page_end: 2 },
        { document_type_id: "iep.progress", page_start: 2, page_end: 2 },
      ],
    });
    expect(validatePackExtractionOutput(unknownType, ctx())).toMatchObject({ reason: "classification_invalid" });
    expect(validatePackExtractionOutput(overlapping, ctx())).toMatchObject({ reason: "classification_invalid" });
  });

  it("accepts compound documents and segment-scoped records", () => {
    const result = validatePackExtractionOutput(
      output(
        [
          header({ "document_header.title": observed("IEP", 1, "Individualized Education Program") }, "r1", 0),
          header({ "document_header.title": observed("Services", 2, "Services") }, "r2", 1),
        ],
        {
          status: "COMPOUND",
          candidates: [{ document_type_id: "iep.plan" }, { document_type_id: "iep.progress" }],
          segments: [
            { document_type_id: "iep.plan", page_start: 1, page_end: 1 },
            { document_type_id: "iep.progress", page_start: 2, page_end: 2 },
          ],
        },
      ),
      ctx(),
    );
    expect(result.usable).toBe(true);
    if (!result.usable) return;
    expect(result.validation.disposition).toBe("VALID");
    expect(result.classification.document_type_ids).toEqual(["iep.plan", "iep.progress"]);
    expect(result.acceptedFacts).toHaveLength(2);
  });

  it("marks UNRECOGNIZED documents without accepting records", () => {
    const result = validatePackExtractionOutput(
      output([header({ "document_header.title": observed("IEP", 1, "Individualized Education Program") })], {
        status: "UNRECOGNIZED",
        candidates: [],
      }),
      ctx(),
    );
    expect(result.usable).toBe(true);
    if (!result.usable) return;
    expect(result.validation.disposition).toBe("UNRECOGNIZED");
    expect(result.acceptedFacts).toEqual([]);
  });
});
