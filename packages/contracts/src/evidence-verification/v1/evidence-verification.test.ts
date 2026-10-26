import { describe, expect, it } from "vitest";

import {
  EVIDENCE_VERIFICATION_REASON_CODES,
  EVIDENCE_VERIFICATION_VERSION,
  EVIDENCE_VERIFIER_VERSION,
  type EvidenceVerificationV1,
} from "./index.js";

describe("evidence-verification@1 constants", () => {
  it("pins stable version strings and reason codes", () => {
    expect(EVIDENCE_VERIFICATION_VERSION).toBe("evidence-verification@1");
    expect(EVIDENCE_VERIFIER_VERSION).toBe("evidence-verifier@2");
    expect(EVIDENCE_VERIFICATION_REASON_CODES).toContain("QUOTE_NOT_IN_PAGE");
    expect(EVIDENCE_VERIFICATION_REASON_CODES).toContain("READ_FINGERPRINT_MISMATCH");
  });

  it("allows a minimal verified payload shape", () => {
    const sample: EvidenceVerificationV1 = {
      contract_version: EVIDENCE_VERIFICATION_VERSION,
      disposition: "VERIFIED",
      reason_code: null,
      verifier_version: EVIDENCE_VERIFIER_VERSION,
      evidence_anchors_verified: 1,
    };
    expect(sample.disposition).toBe("VERIFIED");
  });
});
