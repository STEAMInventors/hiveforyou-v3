// @vitest-environment node

import { describe, expect, it } from "vitest";

import type { UploadProductPolicyV1 } from "@hiveforyou/contracts/documents/v1";

import {
  normalizeUploadMimeType,
  parseClientRequestId,
  parseSha256,
  validateUploadFile,
} from "@/lib/documents/validation";

const policy = (): UploadProductPolicyV1 => ({
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

describe("document validation", () => {
  it("accepts OD-01 mime types by extension", () => {
    const pdf = new File(["x"], "report.pdf", { type: "" });
    expect(normalizeUploadMimeType(pdf, policy().allowed_mime_types)).toBe("application/pdf");
    const png = new File(["x"], "scan.PNG", { type: "" });
    expect(normalizeUploadMimeType(png, policy().allowed_mime_types)).toBe("image/png");
  });

  it("rejects unsupported types", () => {
    const file = new File(["x"], "notes.txt", { type: "text/plain" });
    const result = validateUploadFile(file, policy());
    expect(result.ok).toBe(false);
  });

  it("enforces max bytes from policy", () => {
    const file = new File([new Uint8Array(2048)], "big.pdf", {
      type: "application/pdf",
    });
    const result = validateUploadFile(file, { ...policy(), max_file_bytes: 1024 });
    expect(result.ok).toBe(false);
  });

  it("parses client_request_id and sha256", () => {
    expect(parseClientRequestId("  abcdefgh  ")).toBe("abcdefgh");
    expect(parseClientRequestId("short")).toBeNull();
    const hash = "a".repeat(64);
    expect(parseSha256(hash)).toBe(hash);
    expect(parseSha256("not-a-hash")).toBeNull();
  });
});
