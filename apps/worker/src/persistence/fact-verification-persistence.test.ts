import { describe, expect, it, vi } from "vitest";

import { ErrorCode } from "@hiveforyou/contracts/errors/v1";
import { EVIDENCE_VERIFICATION_REASON_CODES } from "@hiveforyou/contracts/evidence-verification/v1";

import {
  assertEvidenceReasonCodesFitGate2c,
  FactVerificationPersistenceError,
  GATE2C_VERIFICATION_REASON_CODE_RE,
  normalizeGate2cVerificationReasonCode,
  putFactVerification,
} from "./fact-verification-persistence.js";
import type { StudyRunPersistenceClient } from "./study-run-persistence.js";

describe("Gate 2c verification reason codes", () => {
  it("documents contract codes are uppercase but SQL accepts lowercase only", () => {
    expect(EVIDENCE_VERIFICATION_REASON_CODES.every((code) => code === code.toUpperCase())).toBe(true);
    expect(GATE2C_VERIFICATION_REASON_CODE_RE.test("QUOTE_NOT_IN_PAGE")).toBe(false);
    expect(GATE2C_VERIFICATION_REASON_CODE_RE.test("quote_not_in_page")).toBe(true);
  });

  it("maps every evidence-verification reason code to a Gate 2c-safe value", () => {
    assertEvidenceReasonCodesFitGate2c();
    for (const code of EVIDENCE_VERIFICATION_REASON_CODES) {
      expect(normalizeGate2cVerificationReasonCode("REJECTED", code)).toBe(code.toLowerCase());
    }
  });

  it("clears reason on VERIFIED dispositions", () => {
    expect(normalizeGate2cVerificationReasonCode("VERIFIED", "QUOTE_NOT_IN_PAGE")).toBeNull();
  });

  it("lowercases reason codes before putFactVerification RPC", async () => {
    const rpc = vi.fn(async () => ({
      data: { inserted: true, fact_id: "fact-1" },
      error: null,
    }));
    const client = { rpc } as unknown as StudyRunPersistenceClient;

    await putFactVerification(client, "run-1", {
      origin_batch_id: "batch-1",
      source_document_id: "doc-1",
      candidate_key: `sha256:${"a".repeat(64)}`,
      pack_id: "iep",
      pack_version: "2.0.0",
      record_type_id: "document_header",
      record_local_id: "r1",
      parent_record_local_id: null,
      segment_index: 0,
      fact_id: "document_header.title",
      candidate_status: "OBSERVED",
      value_json: "x",
      source_sha256: "b".repeat(64),
      read_fingerprint: "fp",
      page_set_digest: `sha256:${"c".repeat(64)}`,
      verification_disposition: "REJECTED",
      verification_reason_code: "VALUE_NOT_SUPPORTED",
      verifier_version: "evidence-verifier@1",
      evidence_anchors_verified: 0,
      evidence: [],
    });

    expect(rpc).toHaveBeenCalledOnce();
    const args = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    const factPayload = args[1].p_fact as Record<string, unknown>;
    expect(factPayload.verification_reason_code).toBe("value_not_supported");
  });

  it("rejects non-verified dispositions without a reason code", () => {
    expect(() => normalizeGate2cVerificationReasonCode("UNRESOLVED", null)).toThrow(
      FactVerificationPersistenceError,
    );
    try {
      normalizeGate2cVerificationReasonCode("UNRESOLVED", null);
    } catch (error) {
      expect(error).toMatchObject({
        errorCode: ErrorCode.INVALID_REQUEST,
        reason: "verification_reason_required",
      });
    }
  });
});
