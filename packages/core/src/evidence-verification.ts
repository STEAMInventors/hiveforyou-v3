import {
  EVIDENCE_VERIFICATION_VERSION,
  EVIDENCE_VERIFIER_VERSION,
  type EvidenceVerificationReasonCodeV1,
  type EvidenceVerificationV1,
} from "@hiveforyou/contracts/evidence-verification/v1";

import { computePageSetDigest } from "./persisted-page-set-digest.js";
import { computeSha256Digest } from "./pack-digest.js";
import { normalizeQuoteText, quoteFoundInPageText } from "./quote-evidence.js";

const SHA256_DIGEST_RE = /^sha256:[0-9a-f]{64}$/i;

export type PersistedPageCorpusV1 = {
  hive_id: string;
  source_document_id: string;
  source_sha256: string;
  read_fingerprint: string;
  page_set_digest: string;
  pages: ReadonlyArray<{
    page_number: number;
    page_text: string;
    page_text_sha256: string;
  }>;
};

export type ExpectedSourceEvidenceContextV1 = {
  hive_id: string;
  source_document_id: string;
  source_sha256: string;
  read_fingerprint: string;
  page_set_digest: string;
};

export type CandidateFactEvidenceInputV1 = {
  status: "OBSERVED" | "UNCERTAIN" | "NOT_FOUND" | "NOT_APPLICABLE";
  value?: unknown;
  evidence: ReadonlyArray<{ page_number: number; exact_quote: string }>;
};

export type VerifyCandidateFactEvidenceInput = {
  expected: ExpectedSourceEvidenceContextV1;
  persisted: PersistedPageCorpusV1;
  fact: CandidateFactEvidenceInputV1;
  /** Catalog `value_kind` when available; drives deterministic value support checks. */
  valueKind?: string;
};

function rejected(reason: EvidenceVerificationReasonCodeV1, anchorsVerified = 0): EvidenceVerificationV1 {
  return {
    contract_version: EVIDENCE_VERIFICATION_VERSION,
    disposition: "REJECTED",
    reason_code: reason,
    verifier_version: EVIDENCE_VERIFIER_VERSION,
    evidence_anchors_verified: anchorsVerified,
  };
}

function unresolved(reason: EvidenceVerificationReasonCodeV1, anchorsVerified: number): EvidenceVerificationV1 {
  return {
    contract_version: EVIDENCE_VERIFICATION_VERSION,
    disposition: "UNRESOLVED",
    reason_code: reason,
    verifier_version: EVIDENCE_VERIFIER_VERSION,
    evidence_anchors_verified: anchorsVerified,
  };
}

function verified(anchorsVerified: number): EvidenceVerificationV1 {
  return {
    contract_version: EVIDENCE_VERIFICATION_VERSION,
    disposition: "VERIFIED",
    reason_code: null,
    verifier_version: EVIDENCE_VERIFIER_VERSION,
    evidence_anchors_verified: anchorsVerified,
  };
}

function normalizeSha256Hex(value: string): string {
  return value.trim().toLowerCase();
}

function verifyPersistedCorpusIntegrity(persisted: PersistedPageCorpusV1): EvidenceVerificationReasonCodeV1 | null {
  if (persisted.pages.length === 0) {
    return "PAGES_NOT_FOUND";
  }

  for (const page of persisted.pages) {
    if (
      typeof page.page_text !== "string" ||
      typeof page.page_text_sha256 !== "string" ||
      !SHA256_DIGEST_RE.test(page.page_text_sha256)
    ) {
      return "PAGE_TEXT_INTEGRITY_FAILED";
    }
    const computed = computeSha256Digest(page.page_text);
    if (computed.toLowerCase() !== page.page_text_sha256.trim().toLowerCase()) {
      return "PAGE_TEXT_INTEGRITY_FAILED";
    }
  }

  const recomputedDigest = computePageSetDigest({
    sourceSha256: persisted.source_sha256,
    pageCount: persisted.pages.length,
    pages: persisted.pages.map((page) => ({
      page_number: page.page_number,
      page_text_sha256: page.page_text_sha256,
    })),
  });
  if (recomputedDigest.toLowerCase() !== persisted.page_set_digest.trim().toLowerCase()) {
    return "PAGE_SET_DIGEST_MISMATCH";
  }

  return null;
}

function verifySourceBinding(
  expected: ExpectedSourceEvidenceContextV1,
  persisted: PersistedPageCorpusV1,
): EvidenceVerificationReasonCodeV1 | null {
  if (expected.hive_id !== persisted.hive_id) {
    return "SOURCE_HIVE_MISMATCH";
  }
  if (expected.source_document_id !== persisted.source_document_id) {
    return "SOURCE_DOCUMENT_MISMATCH";
  }
  if (normalizeSha256Hex(expected.source_sha256) !== normalizeSha256Hex(persisted.source_sha256)) {
    return "SOURCE_SHA256_MISMATCH";
  }
  if (expected.read_fingerprint.trim() !== persisted.read_fingerprint.trim()) {
    return "READ_FINGERPRINT_MISMATCH";
  }
  if (expected.page_set_digest.trim().toLowerCase() !== persisted.page_set_digest.trim().toLowerCase()) {
    return "PAGE_SET_DIGEST_MISMATCH";
  }
  return null;
}

type AnchorVerification =
  | { ok: true; normalizedQuotes: string[]; count: number }
  | { ok: false; reason: EvidenceVerificationReasonCodeV1; count: number };

function verifyEvidenceAnchors(
  fact: CandidateFactEvidenceInputV1,
  pageTextByNumber: ReadonlyMap<number, string>,
  pageCount: number,
): AnchorVerification {
  if (!Array.isArray(fact.evidence) || fact.evidence.length === 0) {
    return { ok: false, reason: "MISSING_EVIDENCE", count: 0 };
  }

  const normalizedQuotes: string[] = [];
  let verifiedCount = 0;
  let firstFailure: EvidenceVerificationReasonCodeV1 | null = null;

  for (const entry of fact.evidence) {
    if (
      typeof entry.page_number !== "number" ||
      !Number.isInteger(entry.page_number) ||
      typeof entry.exact_quote !== "string" ||
      entry.exact_quote.trim().length === 0
    ) {
      firstFailure ??= "MISSING_EVIDENCE";
      continue;
    }
    const page = entry.page_number;
    if (page < 1 || page > pageCount || !pageTextByNumber.has(page)) {
      firstFailure ??= "PAGE_OUT_OF_RANGE";
      continue;
    }
    const pageText = pageTextByNumber.get(page) ?? "";
    if (!quoteFoundInPageText(pageText, entry.exact_quote)) {
      firstFailure ??= "QUOTE_NOT_IN_PAGE";
      continue;
    }
    normalizedQuotes.push(normalizeQuoteText(entry.exact_quote));
    verifiedCount += 1;
  }

  if (verifiedCount === 0) {
    return { ok: false, reason: firstFailure ?? "MISSING_EVIDENCE", count: 0 };
  }
  return { ok: true, normalizedQuotes, count: verifiedCount };
}

type ValueSupport = "supported" | "unsupported" | "unresolved";

/**
 * Deterministic value-in-quote support. Numeric-only quantity matches are intentionally unresolved
 * (quoted numbers alone do not establish semantic value support).
 */
export function checkDeterministicValueSupport(
  valueKind: string | undefined,
  value: unknown,
  normalizedQuoteTexts: readonly string[],
): ValueSupport {
  if (value === null || value === undefined) {
    return "unsupported";
  }
  const combinedQuotes = normalizedQuoteTexts.join(" ");

  switch (valueKind) {
    case "text":
    case "date": {
      if (typeof value !== "string") {
        return "unsupported";
      }
      const norm = normalizeQuoteText(value);
      return norm.length > 0 && normalizedQuoteTexts.some((quote) => quote.includes(norm))
        ? "supported"
        : "unsupported";
    }
    case "code": {
      if (typeof value !== "string") {
        return "unsupported";
      }
      const token = value.trim();
      if (token.length === 0) {
        return "unsupported";
      }
      return normalizedQuoteTexts.some((quote) => quote.includes(token) || quote.includes(normalizeQuoteText(token)))
        ? "supported"
        : "unsupported";
    }
    case "quantity": {
      if (typeof value === "number") {
        return "unresolved";
      }
      if (typeof value === "string") {
        const norm = normalizeQuoteText(value);
        return norm.length > 0 && combinedQuotes.includes(norm) ? "supported" : "unresolved";
      }
      return "unresolved";
    }
    case "period": {
      if (typeof value === "string") {
        const norm = normalizeQuoteText(value);
        return norm.length > 0 && combinedQuotes.includes(norm) ? "supported" : "unresolved";
      }
      return "unresolved";
    }
    default: {
      if (typeof value === "string") {
        const norm = normalizeQuoteText(value);
        return norm.length > 0 && combinedQuotes.includes(norm) ? "supported" : "unresolved";
      }
      if (typeof value === "boolean") {
        const token = value ? "true" : "false";
        return combinedQuotes.toLowerCase().includes(token) ? "supported" : "unresolved";
      }
      return "unresolved";
    }
  }
}

/**
 * Independently verify a single accepted extraction candidate against persisted page text and
 * source generation identity (`read_fingerprint`, `page_set_digest`, source SHA-256, hive scope).
 */
export function verifyCandidateFactEvidence(input: VerifyCandidateFactEvidenceInput): EvidenceVerificationV1 {
  const bindingIssue = verifySourceBinding(input.expected, input.persisted);
  if (bindingIssue) {
    return rejected(bindingIssue);
  }

  const integrityIssue = verifyPersistedCorpusIntegrity(input.persisted);
  if (integrityIssue) {
    return rejected(integrityIssue);
  }

  const sortedPages = [...input.persisted.pages].sort((a, b) => a.page_number - b.page_number);
  const pageTextByNumber = new Map<number, string>();
  for (let i = 0; i < sortedPages.length; i += 1) {
    const page = sortedPages[i]!;
    const expectedNumber = i + 1;
    if (page.page_number !== expectedNumber) {
      return rejected("PAGE_OUT_OF_RANGE");
    }
    pageTextByNumber.set(page.page_number, page.page_text);
  }
  const pageCount = sortedPages.length;

  const { fact } = input;
  if (fact.status === "NOT_FOUND" || fact.status === "NOT_APPLICABLE") {
    if (!fact.evidence || fact.evidence.length === 0) {
      return rejected("STATUS_REQUIRES_EVIDENCE");
    }
    const anchors = verifyEvidenceAnchors(fact, pageTextByNumber, pageCount);
    if (!anchors.ok) {
      return rejected(anchors.reason, anchors.count);
    }
    return unresolved("VALUE_SUPPORT_UNRESOLVABLE", anchors.count);
  }

  const anchors = verifyEvidenceAnchors(fact, pageTextByNumber, pageCount);
  if (!anchors.ok) {
    return rejected(anchors.reason, anchors.count);
  }

  const valueSupport = checkDeterministicValueSupport(
    input.valueKind,
    fact.value,
    anchors.normalizedQuotes,
  );
  if (valueSupport === "unsupported") {
    return rejected("VALUE_NOT_SUPPORTED", anchors.count);
  }
  if (valueSupport === "unresolved") {
    return unresolved("VALUE_SUPPORT_UNRESOLVABLE", anchors.count);
  }
  return verified(anchors.count);
}
