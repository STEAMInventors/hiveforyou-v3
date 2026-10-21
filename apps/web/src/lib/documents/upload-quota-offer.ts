import type { UploadQuotaV1 } from "@hiveforyou/contracts/documents/v1";

export const UPLOAD_QUOTA_OFFER_HEADLINE = "10 additional uploads — $5 one time";
export const UPLOAD_QUOTA_OFFER_FOOTNOTE =
  "Payments coming soon. Your free uploads reset next month.";

/** True when the user has no free uploads left this UTC month (quota API is source of truth). */
export function isFreeUploadQuotaExhausted(quota: UploadQuotaV1 | null): boolean {
  return quota !== null && quota.remaining <= 0;
}

export function shouldBlockUploadForQuota(quota: UploadQuotaV1 | null): boolean {
  return isFreeUploadQuotaExhausted(quota);
}
