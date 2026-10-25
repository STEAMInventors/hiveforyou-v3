import { describe, expect, it } from "vitest";

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
});
