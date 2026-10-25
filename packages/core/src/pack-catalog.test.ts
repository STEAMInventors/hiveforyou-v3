import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertValidPackRelationships,
  catalogHasBlockingDiagnostics,
  normalizeDomainPackManifest,
  parsePackManifest,
  projectPublicPackMetadata,
  resolvePackCatalog,
} from "./index.js";

const repoRoot = join(process.cwd(), "../..");

describe("resolvePackCatalog", () => {
  it("selects pinned iep 2.0.0 and discovers medicaid without domain-specific code", () => {
    const iepBytes = readFileSync(
      join(repoRoot, "domain-packs/iep/2.0.0/manifest.json"),
      "utf8",
    );
    const medicaidBytes = readFileSync(
      join(repoRoot, "domain-packs/medicaid/1.0.0/manifest.json"),
      "utf8",
    );
    const { packs, diagnostics } = resolvePackCatalog(
      [
        { manifestPath: join(repoRoot, "domain-packs/iep/2.0.0/manifest.json"), bytes: iepBytes },
        {
          manifestPath: join(repoRoot, "domain-packs/medicaid/1.0.0/manifest.json"),
          bytes: medicaidBytes,
        },
      ],
      { reviewedOnly: true, pins: { iep: "2.0.0" } },
    );
    expect(diagnostics.some((entry) => entry.code === "PACK_CORRUPT")).toBe(false);
    expect(packs.map((entry) => entry.manifest.pack_id).sort()).toEqual(["iep", "medicaid"]);
    const publicMeta = projectPublicPackMetadata(packs);
    expect(publicMeta.domains.some((entry) => entry.domain_id === "medicaid")).toBe(true);
  });

  it("fail-closed when required pack is corrupt", () => {
    const { diagnostics } = resolvePackCatalog(
      [{ manifestPath: "domain-packs/bad/1.0.0/manifest.json", bytes: "{not-json" }],
      { requiredPackIds: ["bad"] },
    );
    expect(catalogHasBlockingDiagnostics(diagnostics, ["bad"])).toBe(true);
  });

  it("validates iep v2 relationships", () => {
    const bytes = readFileSync(join(repoRoot, "domain-packs/iep/2.0.0/manifest.json"), "utf8");
    const manifest = normalizeDomainPackManifest(parsePackManifest(JSON.parse(bytes)));
    expect(() => assertValidPackRelationships(manifest)).not.toThrow();
  });

  it("ignores draft iep 2.1.0 for unpinned reviewed catalog selection", () => {
    const iep200Bytes = readFileSync(
      join(repoRoot, "domain-packs/iep/2.0.0/manifest.json"),
      "utf8",
    );
    const iep210Bytes = readFileSync(
      join(repoRoot, "domain-packs/iep/2.1.0/manifest.json"),
      "utf8",
    );
    const { packs, diagnostics } = resolvePackCatalog(
      [
        { manifestPath: join(repoRoot, "domain-packs/iep/2.0.0/manifest.json"), bytes: iep200Bytes },
        { manifestPath: join(repoRoot, "domain-packs/iep/2.1.0/manifest.json"), bytes: iep210Bytes },
      ],
      { reviewedOnly: true },
    );
    expect(diagnostics.some((entry) => entry.code === "PACK_NOT_REVIEWED")).toBe(true);
    expect(packs.find((entry) => entry.manifest.pack_id === "iep")?.manifest.pack_version).toBe(
      "2.0.0",
    );
  });
});
