// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("./hive-edge-gateway", () => ({
  edgeListHives: vi.fn(),
  edgeGetHive: vi.fn(),
  edgeGetHiveByClientRequestId: vi.fn(),
  edgeInsertHive: vi.fn(),
}));

describe("hive repository", () => {
  it("does not reference PostgREST table access in source", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const file = await fs.readFile(path.join(process.cwd(), "src/lib/hives/repository.ts"), "utf8");
    expect(file.includes('.from("hives")')).toBe(false);
    expect(file.includes(".schema(")).toBe(false);
  });
});
