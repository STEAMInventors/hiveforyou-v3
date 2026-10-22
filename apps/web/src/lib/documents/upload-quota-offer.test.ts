import { describe, expect, it } from "vitest";

import type { UploadProductPolicyV1, UploadQuotaV1 } from "@hiveforyou/contracts/documents/v1";

import {
  commercialOfferFootnote,
  formatCommercialOfferHeadline,
  isFreeUploadQuotaExhausted,
  shouldBlockUploadForQuota,
  UPLOAD_QUOTA_OFFER_FOOTNOTE_PAYMENTS_DISABLED,
} from "./upload-quota-offer";

const samplePolicy = (): UploadProductPolicyV1 => ({
  max_file_bytes: 26_214_400,
  free_uploads_per_utc_month: 10,
  allowed_mime_types: ["application/pdf"],
  commercial_offer: {
    upload_count: 10,
    price_cents: 500,
    currency: "USD",
    payments_enabled: false,
  },
});

const sampleQuota = (remaining: number): UploadQuotaV1 => ({
  used: 10 - remaining,
  limit: 10,
  remaining,
  month_start_utc: "2026-10-01T00:00:00.000Z",
  month_end_utc: "2026-11-01T00:00:00.000Z",
});

describe("upload-quota-offer", () => {
  it("formats commercial offer from policy", () => {
    expect(formatCommercialOfferHeadline(samplePolicy())).toBe("10 additional uploads — $5 one time");
    expect(commercialOfferFootnote(samplePolicy())).toBe(UPLOAD_QUOTA_OFFER_FOOTNOTE_PAYMENTS_DISABLED);
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
