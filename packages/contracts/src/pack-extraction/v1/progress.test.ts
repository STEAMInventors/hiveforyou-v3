import { describe, expect, it } from "vitest";

import { packExtractionDocumentArtifactKind, parsePackExtractionProgressV1 } from "./progress.js";

const PROGRESS = {
  contract_version: "pack-extraction-progress@1",
  study_run_id: "run-1",
  hive_id: "hive-1",
  documents_total: 8,
  documents_finished: 3,
  documents_unusable: 1,
};

describe("parsePackExtractionProgressV1", () => {
  it("accepts the owner RPC projection, as an object or JSON text", () => {
    expect(parsePackExtractionProgressV1(PROGRESS).ok).toBe(true);
    expect(parsePackExtractionProgressV1(JSON.stringify(PROGRESS)).ok).toBe(true);
    expect(parsePackExtractionProgressV1({ ...PROGRESS, documents_total: null }).ok).toBe(true);
  });

  it("rejects wrong versions, malformed JSON and impossible counts", () => {
    expect(parsePackExtractionProgressV1({ ...PROGRESS, contract_version: "x@1" })).toMatchObject({ ok: false });
    expect(parsePackExtractionProgressV1("{")).toMatchObject({ ok: false });
    expect(parsePackExtractionProgressV1([])).toMatchObject({ ok: false });
    expect(parsePackExtractionProgressV1({ ...PROGRESS, hive_id: null })).toMatchObject({ ok: false });
    expect(parsePackExtractionProgressV1({ ...PROGRESS, documents_finished: -1 })).toMatchObject({
      ok: false,
      field: "documents_finished",
    });
    expect(parsePackExtractionProgressV1({ ...PROGRESS, documents_finished: 9 })).toMatchObject({
      ok: false,
      field: "documents_finished",
    });
    expect(parsePackExtractionProgressV1({ ...PROGRESS, documents_unusable: 4 })).toMatchObject({
      ok: false,
      field: "documents_unusable",
    });
    expect(parsePackExtractionProgressV1({ ...PROGRESS, documents_total: 1.5 })).toMatchObject({
      ok: false,
      field: "documents_total",
    });
  });
});

describe("packExtractionDocumentArtifactKind", () => {
  it("suffixes the versioned kind with the source document id", () => {
    expect(packExtractionDocumentArtifactKind("doc-1")).toBe("pack-extraction-document@1:doc-1");
  });
});
