// @vitest-environment node

import { describe, expect, it } from "vitest";

import type { UploadProductPolicyV1 } from "@hiveforyou/contracts/documents/v1";

import {
  buildUploadAcceptAttribute,
  parseUploadProductPolicyV1,
  uploadTypeGuidanceLabel,
  uploadValidationErrorLabel,
} from "./upload-policy";

const samplePolicy = (): UploadProductPolicyV1 => ({
  max_file_bytes: 26_214_400,
  free_uploads_per_utc_month: 10,
  allowed_mime_types: [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  commercial_offer: {
    upload_count: 10,
    price_cents: 500,
    currency: "USD",
    payments_enabled: false,
  },
});

describe("upload-policy", () => {
  it("parses policy from RPC-shaped JSON", () => {
    const parsed = parseUploadProductPolicyV1({
      max_file_bytes: 26_214_400,
      free_uploads_per_utc_month: 10,
      allowed_mime_types: ["application/pdf", "image/png"],
      commercial_offer: {
        upload_count: 10,
        price_cents: 500,
        currency: "USD",
        payments_enabled: false,
      },
    });
    expect(parsed?.max_file_bytes).toBe(26_214_400);
    expect(parsed?.commercial_offer.price_cents).toBe(500);
  });

  it("rejects unknown mime types in policy payload", () => {
    expect(
      parseUploadProductPolicyV1({
        max_file_bytes: 1024,
        free_uploads_per_utc_month: 10,
        allowed_mime_types: ["text/plain"],
        commercial_offer: {
          upload_count: 10,
          price_cents: 500,
          currency: "USD",
          payments_enabled: false,
        },
      }),
    ).toBeNull();
  });

  it("builds UI guidance from dynamic max bytes", () => {
    const policy = samplePolicy();
    expect(uploadTypeGuidanceLabel(policy)).toContain("25 MB");
    expect(uploadValidationErrorLabel({ ...policy, max_file_bytes: 52_428_800 })).toContain("50 MB");
    expect(buildUploadAcceptAttribute(policy)).toContain("application/pdf");
    expect(buildUploadAcceptAttribute(policy)).toContain(".docx");
  });
});
