export const EVIDENCE_VERIFICATION_VERSION = "evidence-verification@1" as const;

export const EVIDENCE_VERIFIER_VERSION = "evidence-verifier@2" as const;

export const EVIDENCE_VERIFICATION_DISPOSITIONS = ["VERIFIED", "REJECTED", "UNRESOLVED"] as const;

export type EvidenceVerificationDispositionV1 = (typeof EVIDENCE_VERIFICATION_DISPOSITIONS)[number];

export const EVIDENCE_VERIFICATION_REASON_CODES = [
  "SOURCE_HIVE_MISMATCH",
  "SOURCE_DOCUMENT_MISMATCH",
  "SOURCE_SHA256_MISMATCH",
  "READ_FINGERPRINT_MISMATCH",
  "PAGE_SET_DIGEST_MISMATCH",
  "PAGES_NOT_FOUND",
  "PAGE_TEXT_INTEGRITY_FAILED",
  "MISSING_EVIDENCE",
  "PAGE_OUT_OF_RANGE",
  "QUOTE_NOT_IN_PAGE",
  "STATUS_REQUIRES_EVIDENCE",
  "VALUE_NOT_SUPPORTED",
  "VALUE_SUPPORT_UNRESOLVABLE",
] as const;

export type EvidenceVerificationReasonCodeV1 = (typeof EVIDENCE_VERIFICATION_REASON_CODES)[number];

export type EvidenceVerificationV1 = {
  contract_version: typeof EVIDENCE_VERIFICATION_VERSION;
  disposition: EvidenceVerificationDispositionV1;
  reason_code: EvidenceVerificationReasonCodeV1 | null;
  verifier_version: typeof EVIDENCE_VERIFIER_VERSION;
  evidence_anchors_verified: number;
};
