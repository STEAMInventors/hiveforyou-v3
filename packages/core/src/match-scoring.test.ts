import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parsePackManifest } from "./pack-validation.js";
import { detectTitleBodyCollision, scoreAllDocumentTypes } from "./match-scoring.js";

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

  it("detects title/body leaders that disagree", () => {
    const collision = detectTitleBodyCollision([
      {
        pack_id: "iep",
        pack_version: "2.0.0",
        domain_id: "iep",
        document_type_id: "iep.plan",
        score: 0.62,
        reasons: [],
        title_score: 0.45,
        body_score: 0.1,
      },
      {
        pack_id: "iep",
        pack_version: "2.0.0",
        domain_id: "iep",
        document_type_id: "iep.progress",
        score: 0.58,
        reasons: [],
        title_score: 0.05,
        body_score: 0.42,
      },
    ]);
    expect(collision?.titleLeader.document_type_id).toBe("iep.plan");
    expect(collision?.bodyLeader.document_type_id).toBe("iep.progress");
  });
});
