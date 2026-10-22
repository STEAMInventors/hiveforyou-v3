import type { UploadProductPolicyV1, UploadQuotaV1 } from "@hiveforyou/contracts/documents/v1";

export const UPLOAD_QUOTA_OFFER_FOOTNOTE_PAYMENTS_DISABLED =
  "Payments coming soon. Your free uploads reset next month.";

export function formatCommercialOfferHeadline(policy: UploadProductPolicyV1): string {
  const { upload_count, price_cents, currency } = policy.commercial_offer;
  const dollars = (price_cents / 100).toFixed(price_cents % 100 === 0 ? 0 : 2);
  const currencyLabel = currency.toUpperCase() === "USD" ? "$" : `${currency.toUpperCase()} `;
  const price =
    currency.toUpperCase() === "USD" ? `${currencyLabel}${dollars}` : `${currencyLabel}${dollars}`;
  return `${upload_count} additional uploads — ${price} one time`;
}

export function commercialOfferFootnote(policy: UploadProductPolicyV1): string {
  if (policy.commercial_offer.payments_enabled) {
    return "Purchase additional uploads that never expire.";
  }
  return UPLOAD_QUOTA_OFFER_FOOTNOTE_PAYMENTS_DISABLED;
}

/** True when the user has no free uploads left this UTC month (quota API is source of truth). */
export function isFreeUploadQuotaExhausted(quota: UploadQuotaV1 | null): boolean {
  return quota !== null && quota.remaining <= 0;
}

export function shouldBlockUploadForQuota(quota: UploadQuotaV1 | null): boolean {
  return isFreeUploadQuotaExhausted(quota);
}
