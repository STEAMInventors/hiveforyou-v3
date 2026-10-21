import { describe, expect, it } from "vitest";

import type { UploadQuotaV1 } from "@hiveforyou/contracts/documents/v1";

import {
  isFreeUploadQuotaExhausted,
  shouldBlockUploadForQuota,
  UPLOAD_QUOTA_OFFER_FOOTNOTE,
  UPLOAD_QUOTA_OFFER_HEADLINE,
} from "./upload-quota-offer";

const sampleQuota = (remaining: number): UploadQuotaV1 => ({
  used: 10 - remaining,
  limit: 10,
  remaining,
  month_start_utc: "2026-10-01T00:00:00.000Z",
  month_end_utc: "2026-11-01T00:00:00.000Z",
});

describe("upload-quota-offer", () => {
  it("exports approved offer copy", () => {
    expect(UPLOAD_QUOTA_OFFER_HEADLINE).toBe("10 additional uploads — $5 one time");
    expect(UPLOAD_QUOTA_OFFER_FOOTNOTE).toBe(
      "Payments coming soon. Your free uploads reset next month.",
    );
  });

  it("treats null quota as not exhausted", () => {
    expect(isFreeUploadQuotaExhausted(null)).toBe(false);
    expect(shouldBlockUploadForQuota(null)).toBe(false);
  });

  it("blocks upload at zero remaining", () => {
    expect(isFreeUploadQuotaExhausted(sampleQuota(0))).toBe(true);
    expect(shouldBlockUploadForQuota(sampleQuota(0))).toBe(true);
  });

  it("allows upload when remaining is positive", () => {
    expect(isFreeUploadQuotaExhausted(sampleQuota(1))).toBe(false);
    expect(shouldBlockUploadForQuota(sampleQuota(10))).toBe(false);
  });
});
