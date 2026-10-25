import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { loadDomainPacksFromRoot, loadDomainPacksOrThrow } from "./load-packs.js";

const repoRoot = join(process.cwd(), "../..");
const packsRoot = join(repoRoot, "domain-packs");

describe("loadDomainPacksFromRoot", () => {
  it("loads reviewed packs with explicit iep pin", () => {
    const result = loadDomainPacksFromRoot(packsRoot, {
      reviewedOnly: true,
      pins: { iep: "2.0.0" },
    });
    expect(result.packs.some((entry) => entry.manifest.pack_id === "medicaid")).toBe(true);
    expect(result.packs.find((entry) => entry.manifest.pack_id === "iep")?.manifest.pack_version).toBe(
      "2.0.0",
    );
  });

  it("does not promote draft iep 2.1.0 when unpinned and reviewedOnly", () => {
    const result = loadDomainPacksFromRoot(packsRoot, { reviewedOnly: true });
    const iep = result.packs.find((entry) => entry.manifest.pack_id === "iep");
    expect(iep?.manifest.pack_version).toBe("2.0.0");
    expect(
      result.diagnostics.some(
        (entry) => entry.code === "PACK_NOT_REVIEWED" && entry.pack_version === "2.1.0",
      ),
    ).toBe(true);
  });

  it("throws for corrupt required pack directory", () => {
    expect(() =>
      loadDomainPacksOrThrow(packsRoot, {
        requiredPackIds: ["missing-pack-id"],
        pins: { "missing-pack-id": "9.9.9" },
      }),
    ).toThrow();
  });
});
