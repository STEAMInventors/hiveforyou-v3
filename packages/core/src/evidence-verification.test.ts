import { describe, expect, it } from "vitest";

import { EVIDENCE_VERIFIER_VERSION } from "@hiveforyou/contracts/evidence-verification/v1";

import { computeSha256Digest } from "./pack-digest.js";
import { computePageSetDigest } from "./persisted-page-set-digest.js";
import {
  checkDeterministicValueSupport,
  verifyCandidateFactEvidence,
  type PersistedPageCorpusV1,
} from "./evidence-verification.js";
import { normalizeQuoteText } from "./quote-evidence.js";

const HIVE = "hive-a";
const SOURCE = "source-1";
const SHA = "a".repeat(64);
const FINGERPRINT = "read-fp-1";

const SUBTYPE_ENUM_VALUES = [
  "initial",
  "annual",
  "review",
  "revised",
  "reevaluation",
  "interim",
  "other",
] as const;

function pageText(text: string) {
  return { page_text: text, page_text_sha256: computeSha256Digest(text) };
}

function corpus(pages: Array<{ page_number: number; text: string }>): PersistedPageCorpusV1 {
  const rows = pages.map((p) => ({
    page_number: p.page_number,
    ...pageText(p.text),
  }));
  const digest = computePageSetDigest({
    sourceSha256: SHA,
    pageCount: rows.length,
    pages: rows,
  });
  return {
    hive_id: HIVE,
    source_document_id: SOURCE,
    source_sha256: SHA,
    read_fingerprint: FINGERPRINT,
    page_set_digest: digest,
    pages: rows,
  };
}

function expectedFrom(c: PersistedPageCorpusV1) {
  return {
    hive_id: c.hive_id,
    source_document_id: c.source_document_id,
    source_sha256: c.source_sha256,
    read_fingerprint: c.read_fingerprint,
    page_set_digest: c.page_set_digest,
  };
}

describe("verifyCandidateFactEvidence", () => {
  const persisted = corpus([
    { page_number: 1, text: "Individualized Education Program\nStudent: Jordan Lee" },
    { page_number: 2, text: "Speech-language therapy 30 minutes weekly" },
  ]);

  it("VERIFIED when anchors and text value appear in persisted pages", () => {
    const result = verifyCandidateFactEvidence({
      expected: expectedFrom(persisted),
      persisted,
      fact: {
        status: "OBSERVED",
        value: "Individualized Education Program",
        evidence: [{ page_number: 1, exact_quote: "Individualized Education Program" }],
      },
      valueKind: "text",
    });
    expect(result.disposition).toBe("VERIFIED");
    expect(result.reason_code).toBeNull();
    expect(result.evidence_anchors_verified).toBe(1);
  });

  it("REJECTED when quote is absent from persisted page text (independence from extract-time memory)", () => {
    const result = verifyCandidateFactEvidence({
      expected: expectedFrom(persisted),
      persisted,
      fact: {
        status: "OBSERVED",
        value: "Wrong Title",
        evidence: [{ page_number: 1, exact_quote: "Fabricated quote not in corpus" }],
      },
      valueKind: "text",
    });
    expect(result).toMatchObject({ disposition: "REJECTED", reason_code: "QUOTE_NOT_IN_PAGE" });
  });

  it("REJECTED when declared value is not supported by verified quotes", () => {
    const result = verifyCandidateFactEvidence({
      expected: expectedFrom(persisted),
      persisted,
      fact: {
        status: "OBSERVED",
        value: "Jordan Lee",
        evidence: [{ page_number: 1, exact_quote: "Individualized Education Program" }],
      },
      valueKind: "text",
    });
    expect(result).toMatchObject({ disposition: "REJECTED", reason_code: "VALUE_NOT_SUPPORTED" });
  });

  it("UNRESOLVED for numeric quantity even when the number appears in the quote", () => {
    const result = verifyCandidateFactEvidence({
      expected: expectedFrom(persisted),
      persisted,
      fact: {
        status: "OBSERVED",
        value: 30,
        evidence: [{ page_number: 2, exact_quote: "Speech-language therapy 30 minutes weekly" }],
      },
      valueKind: "quantity",
    });
    expect(result).toMatchObject({
      disposition: "UNRESOLVED",
      reason_code: "VALUE_SUPPORT_UNRESOLVABLE",
    });
  });

  it("REJECTED on read generation mismatch", () => {
    const result = verifyCandidateFactEvidence({
      expected: { ...expectedFrom(persisted), read_fingerprint: "other-fingerprint" },
      persisted,
      fact: {
        status: "OBSERVED",
        value: "Individualized Education Program",
        evidence: [{ page_number: 1, exact_quote: "Individualized Education Program" }],
      },
      valueKind: "text",
    });
    expect(result).toMatchObject({ disposition: "REJECTED", reason_code: "READ_FINGERPRINT_MISMATCH" });
  });

  it("REJECTED on page_set_digest mismatch", () => {
    const result = verifyCandidateFactEvidence({
      expected: { ...expectedFrom(persisted), page_set_digest: `sha256:${"b".repeat(64)}` },
      persisted,
      fact: {
        status: "OBSERVED",
        value: "Individualized Education Program",
        evidence: [{ page_number: 1, exact_quote: "Individualized Education Program" }],
      },
      valueKind: "text",
    });
    expect(result).toMatchObject({ disposition: "REJECTED", reason_code: "PAGE_SET_DIGEST_MISMATCH" });
  });

  it("REJECTED on cross-Hive expected context", () => {
    const result = verifyCandidateFactEvidence({
      expected: { ...expectedFrom(persisted), hive_id: "hive-other" },
      persisted,
      fact: {
        status: "OBSERVED",
        value: "Individualized Education Program",
        evidence: [{ page_number: 1, exact_quote: "Individualized Education Program" }],
      },
      valueKind: "text",
    });
    expect(result).toMatchObject({ disposition: "REJECTED", reason_code: "SOURCE_HIVE_MISMATCH" });
  });

  it("REJECTED when NOT_FOUND lacks evidence", () => {
    const result = verifyCandidateFactEvidence({
      expected: expectedFrom(persisted),
      persisted,
      fact: { status: "NOT_FOUND", evidence: [] },
    });
    expect(result).toMatchObject({ disposition: "REJECTED", reason_code: "STATUS_REQUIRES_EVIDENCE" });
  });

  it("matches quotes after shared normalization", () => {
    expect(normalizeQuoteText("ﬁle\u00a0 a")).toBe("file a");
    const c = corpus([{ page_number: 1, text: "Individualized   Education\nProgram" }]);
    const result = verifyCandidateFactEvidence({
      expected: expectedFrom(c),
      persisted: c,
      fact: {
        status: "OBSERVED",
        value: "Individualized Education Program",
        evidence: [{ page_number: 1, exact_quote: "Individualized   Education\nProgram" }],
      },
      valueKind: "text",
    });
    expect(result.disposition).toBe("VERIFIED");
  });
});

describe("checkDeterministicValueSupport", () => {
  it("treats bare numeric quantity as unresolved", () => {
    expect(checkDeterministicValueSupport("quantity", 42, ["line with 42 units"])).toBe("unresolved");
  });

  it("VERIFIED code path: underscore code matches spaced prose in quote", () => {
    const support = checkDeterministicValueSupport(
      "code",
      "education_agency",
      ["Author role: education agency"],
      {
        factFieldKey: "document_header.author_role",
        enumValues: [
          "education_agency",
          "school_evaluator",
          "eligibility_team",
          "independent_evaluator",
          "parent_guardian",
          "referrer",
          "other",
        ],
        fieldSynonyms: null,
      },
    );
    expect(support).toBe("supported");
  });

  it.each([
    ["annual before review", ["initial", "annual", "review", "revised", "reevaluation", "interim", "other"]],
    ["review before annual", ["initial", "review", "annual", "revised", "reevaluation", "interim", "other"]],
  ] as const)(
    "UNRESOLVED when quotes support multiple enum codes (%s)",
    (_label, enumValues) => {
      const support = checkDeterministicValueSupport(
        "code",
        "annual",
        ["Annual review meeting"],
        {
          factFieldKey: "document_header.subtype",
          enumValues: [...enumValues],
          fieldSynonyms: null,
        },
      );
      expect(support).toBe("unresolved");
    },
  );

  it.each([
    ["synonym-first enum order", ["annual", "review"]],
    ["literal-first enum order", ["review", "annual"]],
  ] as const)(
    "UNRESOLVED when literal and pack synonym match different codes (%s)",
    (_label, enumValues) => {
      const support = checkDeterministicValueSupport(
        "code",
        "annual",
        ["Annual Plan review session"],
        {
          factFieldKey: "document_header.subtype",
          enumValues: [...enumValues],
          fieldSynonyms: [
            {
              field: "document_header.subtype",
              terms: ["Annual Plan"],
              value: "annual",
            },
          ],
        },
      );
      expect(support).toBe("unresolved");
    },
  );

  it("uses pack fieldSynonyms for catalog code support", () => {
    const support = checkDeterministicValueSupport(
      "code",
      "words_correct_per_minute",
      ["Baseline WCPM score recorded"],
      {
        factFieldKey: "measure.score_type",
        enumValues: ["words_correct_per_minute", "percent_accuracy"],
        fieldSynonyms: [
          {
            field: "measure.score_type",
            terms: ["WCPM", "words correct per minute"],
            value: "words_correct_per_minute",
          },
        ],
      },
    );
    expect(support).toBe("supported");
  });

  it("ISO catalog date matches US-formatted quote date", () => {
    expect(
      checkDeterministicValueSupport("date", "2024-03-15", ["Effective date 3/15/2024"]),
    ).toBe("supported");
  });

  it("UNRESOLVED when quotes contain contradictory calendar dates", () => {
    expect(
      checkDeterministicValueSupport("date", "2024-03-15", [
        "Start 3/15/2024 end 4/01/2024",
      ]),
    ).toBe("unresolved");
  });

  it("REJECTED when ISO date does not match quote dates", () => {
    expect(
      checkDeterministicValueSupport("date", "2024-03-15", ["Effective 4/01/2024"]),
    ).toBe("unsupported");
  });
});

describe("verifyCandidateFactEvidence — code and date vocabulary", () => {
  const persisted = corpus([{ page_number: 1, text: "Plan subtype is annual on 3/15/2024" }]);

  it("stamps evidence-verifier@2 on outcomes", () => {
    const result = verifyCandidateFactEvidence({
      expected: expectedFrom(persisted),
      persisted,
      fact: {
        status: "OBSERVED",
        value: "annual",
        evidence: [{ page_number: 1, exact_quote: "Plan subtype is annual" }],
      },
      valueKind: "code",
      valueSupportContext: {
        factFieldKey: "document_header.subtype",
        enumValues: [...SUBTYPE_ENUM_VALUES],
        fieldSynonyms: null,
      },
    });
    expect(result.verifier_version).toBe(EVIDENCE_VERIFIER_VERSION);
    expect(result.verifier_version).toBe("evidence-verifier@2");
  });

  it("UNRESOLVED end-to-end when quotes support multiple catalog codes", () => {
    const multi = corpus([{ page_number: 1, text: "Annual review meeting notes" }]);
    const result = verifyCandidateFactEvidence({
      expected: expectedFrom(multi),
      persisted: multi,
      fact: {
        status: "OBSERVED",
        value: "annual",
        evidence: [{ page_number: 1, exact_quote: "Annual review meeting" }],
      },
      valueKind: "code",
      valueSupportContext: {
        factFieldKey: "document_header.subtype",
        enumValues: ["review", "annual", "initial"],
        fieldSynonyms: null,
      },
    });
    expect(result).toMatchObject({
      disposition: "UNRESOLVED",
      reason_code: "VALUE_SUPPORT_UNRESOLVABLE",
      verifier_version: "evidence-verifier@2",
    });
  });

  it("VERIFIED for spaced enum phrase with catalog context", () => {
    const result = verifyCandidateFactEvidence({
      expected: expectedFrom(persisted),
      persisted,
      fact: {
        status: "OBSERVED",
        value: "annual",
        evidence: [{ page_number: 1, exact_quote: "Plan subtype is annual" }],
      },
      valueKind: "code",
      valueSupportContext: {
        factFieldKey: "document_header.subtype",
        enumValues: ["initial", "annual", "review", "revised", "reevaluation", "interim", "other"],
        fieldSynonyms: null,
      },
    });
    expect(result.disposition).toBe("VERIFIED");
  });
});
