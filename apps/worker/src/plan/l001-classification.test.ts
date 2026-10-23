import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { normalizeDomainPackManifest, parsePackManifest } from "@hiveforyou/core";

import { classifyDocument } from "./classify.js";
import { L001_CORPUS } from "./l001-corpus.fixture.js";

const repoRoot = join(process.cwd(), "../..");
const iepManifest = normalizeDomainPackManifest(
  parsePackManifest(
    JSON.parse(
      readFileSync(join(repoRoot, "domain-packs/iep/2.0.0/manifest.json"), "utf8"),
    ),
  ),
);

describe("L001 pack-driven classification", () => {
  it("classifies all eight synthetic L001 documents to V2 taxonomy ids", () => {
    for (const doc of L001_CORPUS) {
      const classification = classifyDocument({
        source_document_id: doc.source_document_id,
        filename: doc.filename,
        pages: doc.pages,
        domain_hint: "iep",
        packs: [iepManifest],
      });
      expect(classification.chosen.document_type_id).toBe(doc.expected_document_type_id);
    }
  });
});
