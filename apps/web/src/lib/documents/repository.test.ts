// @vitest-environment node

import { describe, expect, it } from "vitest";

describe("document repository", () => {
  it("does not reference PostgREST table access in source", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const file = await fs.readFile(
      path.join(process.cwd(), "src/lib/documents/repository.ts"),
      "utf8",
    );
    expect(file.includes('.from("source_documents")')).toBe(false);
    expect(file.includes(".schema(")).toBe(false);
  });
});
