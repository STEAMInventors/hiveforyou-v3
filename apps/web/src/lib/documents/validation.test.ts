// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  normalizeUploadMimeType,
  parseClientRequestId,
  parseSha256,
  validateUploadFile,
} from "@/lib/documents/validation";

describe("document validation", () => {
  it("accepts OD-01 mime types by extension", () => {
    const pdf = new File(["x"], "report.pdf", { type: "" });
    expect(normalizeUploadMimeType(pdf)).toBe("application/pdf");
    const png = new File(["x"], "scan.PNG", { type: "" });
    expect(normalizeUploadMimeType(png)).toBe("image/png");
  });

  it("rejects unsupported types", () => {
    const file = new File(["x"], "notes.txt", { type: "text/plain" });
    const result = validateUploadFile(file, 1024 * 1024);
    expect(result.ok).toBe(false);
  });

  it("enforces max bytes", () => {
    const file = new File([new Uint8Array(2048)], "big.pdf", {
      type: "application/pdf",
    });
    const result = validateUploadFile(file, 1024);
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
