import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parsePackManifest } from "./pack-validation.js";
import { scoreAllDocumentTypes } from "./match-scoring.js";

const iepManifestPath = join(
  process.cwd(),
  "../../domain-packs/iep/1.0.0/manifest.json",
);

describe("scoreAllDocumentTypes", () => {
  it("ranks initial IEP above progress report for IEP fixture text", () => {
    const raw = JSON.parse(readFileSync(iepManifestPath, "utf8"));
    const manifest = parsePackManifest(raw);
    const text = `
      Individualized Education Program
      Annual Goal
      Related Services
      Present Levels of Performance
    `;
    const scores = scoreAllDocumentTypes([manifest], {
      combinedPageText: text,
      pageCount: 4,
      filename: "annual-iep.pdf",
    });
    expect(scores[0]?.document_type_id).toBe("iep_initial");
  });
});
