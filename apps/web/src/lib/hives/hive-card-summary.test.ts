import { describe, expect, it } from "vitest";

import {
  formatHiveFilenamePreview,
  formatRegisteredDocumentCount,
  HIVE_DOMAIN_UNKNOWN_LABEL,
} from "./hive-card-summary";

describe("hive-card-summary", () => {
  it("uses the unknown domain label constant", () => {
    expect(HIVE_DOMAIN_UNKNOWN_LABEL).toBe("Not identified yet.");
  });

  it("formats document counts when present", () => {
    expect(formatRegisteredDocumentCount(undefined)).toBeNull();
    expect(formatRegisteredDocumentCount(0)).toBe("0 documents");
    expect(formatRegisteredDocumentCount(1)).toBe("1 document");
    expect(formatRegisteredDocumentCount(4)).toBe("4 documents");
  });

  it("formats filename preview with remainder", () => {
    expect(formatHiveFilenamePreview(undefined, ["a.pdf"])).toBeNull();
    expect(formatHiveFilenamePreview(0, [])).toBeNull();
    expect(formatHiveFilenamePreview(2, ["one.pdf", "two.pdf"])).toBe("one.pdf, two.pdf");
    expect(formatHiveFilenamePreview(5, ["a.pdf", "b.pdf", "c.pdf"])).toBe(
      "a.pdf, b.pdf, c.pdf, +2 more",
    );
  });
});
