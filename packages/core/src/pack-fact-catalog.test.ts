import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildCanonicalPackManifest,
  buildPackFactCatalog,
  computeCatalogDigest,
  computeJcsSha256Digest,
  computeOutputSchemaDigest,
  PackFactCatalogError,
  serializePackJcs,
  validatePackFactCatalog,
} from "./index.js";
import { normalizeDomainPackManifest } from "./pack-normalize.js";
import { parsePackManifest } from "./pack-validation.js";

const repoRoot = join(process.cwd(), "../..");
const iep200Path = join(repoRoot, "domain-packs/iep/2.0.0/manifest.json");
const iep210Path = join(repoRoot, "domain-packs/iep/2.1.0/manifest.json");

const GOLDEN_IEP_200 = {
  pack_digest: "9cccf442c870edf43470252690332889f784193c7a5710353cda1677bc927c84",
  pack_canonical_digest:
    "sha256:c11ed275a91f62d6a3b934bd698ebbe4de9361d5dc38e8d66c53cdaa4e886972",
  catalog_digest: "sha256:91d08f0fcc38f319f1a894e3a8b8d343d826c6bdb096a513d07ede821dc60ce7",
  output_schema_digest: "sha256:4850d87a9cd79963fe64e849cc8336dcb86f63b890a352e8ee73805b2f0aacef",
};

const GOLDEN_IEP_210 = {
  pack_digest: "be11dd5be17d9ffcb92985696abc7a381fd1865b86b9da23ee8c5d667a9d47b7",
  pack_canonical_digest:
    "sha256:ee9459c67f666ba1bbe5318c82a5fb74d96f88a1f475c11ebaa034ac2265ae58",
  catalog_digest: "sha256:86eec42968ae274bae8abccdcbc911d61fee2dec7f04357abab4704ed3b6a831",
  output_schema_digest: GOLDEN_IEP_200.output_schema_digest,
};

function loadManifest(path: string) {
  const bytes = readFileSync(path, "utf8");
  const manifest = normalizeDomainPackManifest(parsePackManifest(JSON.parse(bytes)));
  return { bytes, manifest };
}

describe("buildPackFactCatalog — IEP 2.0.0 (reviewed)", () => {
  const { bytes, manifest } = loadManifest(iep200Path);
  const result = buildPackFactCatalog(manifest, { manifestBytes: bytes });

  it("enumerates 131 facts with stable nested field ids", () => {
    expect(result.catalog_fact_count).toBe(131);
    expect(result.fact_ids).toHaveLength(131);
    expect(new Set(result.fact_ids).size).toBe(131);
    expect(result.fact_ids).toContain("goal.measure.score_type");
    expect(result.fact_ids).toContain("measurement.measure.task");
    const goal = result.catalog.record_types.find((r) => r.record_type_id === "goal");
    expect(goal?.facts.some((f) => f.field_id === "measure.score_type")).toBe(true);
  });

  it("matches golden digests", () => {
    expect(result.pack_digest).toBe(GOLDEN_IEP_200.pack_digest);
    expect(result.pack_canonical_digest).toBe(GOLDEN_IEP_200.pack_canonical_digest);
    expect(result.catalog_digest).toBe(GOLDEN_IEP_200.catalog_digest);
    expect(result.output_schema_digest).toBe(GOLDEN_IEP_200.output_schema_digest);
    expect(computeOutputSchemaDigest()).toBe(GOLDEN_IEP_200.output_schema_digest);
  });

  it("is stable under manifest key reordering", () => {
    const parsed = JSON.parse(bytes) as Record<string, unknown>;
    const reordered = {
      review_status: parsed.review_status,
      pack_version: parsed.pack_version,
      pack_id: parsed.pack_id,
      contract_version: parsed.contract_version,
      ...parsed,
    };
    const shuffledBytes = JSON.stringify(reordered, null, 2);
    const remanifest = normalizeDomainPackManifest(parsePackManifest(JSON.parse(shuffledBytes)));
    const again = buildPackFactCatalog(remanifest, { manifestBytes: shuffledBytes });
    expect(again.pack_canonical_digest).toBe(GOLDEN_IEP_200.pack_canonical_digest);
    expect(again.catalog_digest).toBe(GOLDEN_IEP_200.catalog_digest);
    expect(again.pack_digest).not.toBe(GOLDEN_IEP_200.pack_digest);
  });

  it("changes body and canonical digests when a field description changes", () => {
    const tweaked = structuredClone(manifest);
    const goal = tweaked.record_types!.find((r) => r.record_type_id === "goal")!;
    const field = goal.fields.find((f) => f.field_id === "statement")!;
    field.description = `${field.description ?? ""} (qualification tweak)`;
    const tweakedResult = buildPackFactCatalog(tweaked);
    expect(tweakedResult.catalog_digest).toBe(GOLDEN_IEP_200.catalog_digest);
    expect(tweakedResult.catalog_body_digest).not.toBe(result.catalog_body_digest);
    expect(tweakedResult.pack_canonical_digest).not.toBe(GOLDEN_IEP_200.pack_canonical_digest);
  });

  it("changes catalog body digest when enum order changes", () => {
    const tweaked = structuredClone(manifest);
    const goal = tweaked.record_types!.find((r) => r.record_type_id === "goal")!;
    const scoreType = goal.fields.find((f) => f.field_id === "measure.score_type")!;
    scoreType.enum = [...(scoreType.enum ?? [])].reverse();
    const tweakedResult = buildPackFactCatalog(tweaked);
    expect(tweakedResult.catalog_digest).toBe(GOLDEN_IEP_200.catalog_digest);
    expect(tweakedResult.catalog_body_digest).not.toBe(result.catalog_body_digest);
  });
});

describe("buildPackFactCatalog — IEP 2.1.0 (draft pin)", () => {
  const { bytes, manifest } = loadManifest(iep210Path);
  const result = buildPackFactCatalog(manifest, { manifestBytes: bytes });

  it("enumerates 150 facts additively over 2.0.0", () => {
    expect(result.catalog_fact_count).toBe(150);
    const base = buildPackFactCatalog(loadManifest(iep200Path).manifest);
    for (const factId of base.fact_ids) {
      expect(result.fact_ids).toContain(factId);
    }
    expect(result.fact_ids.length - base.fact_ids.length).toBe(19);
  });

  it("matches golden digests for draft 2.1.0", () => {
    expect(result.pack_digest).toBe(GOLDEN_IEP_210.pack_digest);
    expect(result.pack_canonical_digest).toBe(GOLDEN_IEP_210.pack_canonical_digest);
    expect(result.catalog_digest).toBe(GOLDEN_IEP_210.catalog_digest);
  });
});

describe("validatePackFactCatalog — negative paths", () => {
  const { manifest } = loadManifest(iep210Path);

  it("rejects duplicate field_id within a record", () => {
    const broken = structuredClone(manifest);
    const goal = broken.record_types!.find((r) => r.record_type_id === "goal")!;
    goal.fields.push({ ...goal.fields[0]! });
    const issues = validatePackFactCatalog(broken);
    expect(issues.some((i) => i.code === "DUPLICATE_FIELD_ID")).toBe(true);
    expect(() => buildPackFactCatalog(broken)).toThrow(PackFactCatalogError);
  });

  it("rejects invalid identity key_fields references", () => {
    const broken = structuredClone(manifest);
    const goal = broken.record_types!.find((r) => r.record_type_id === "goal")!;
    goal.identity.key_fields.push("not_a_real_field");
    const issues = validatePackFactCatalog(broken);
    expect(issues.some((i) => i.code === "INVALID_IDENTITY_REFERENCE")).toBe(true);
  });

  it("rejects unknown checklist record references via relationship validation", () => {
    const broken = structuredClone(manifest);
    const doc = broken.document_types.find((d) => d.document_type_id === "iep.plan")!;
    if ("checklist" in doc && Array.isArray(doc.checklist)) {
      doc.checklist.push("not_a_record");
    }
    const issues = validatePackFactCatalog(broken);
    expect(issues.some((i) => i.code === "RELATIONSHIP_INVALID")).toBe(true);
  });
});

describe("JCS helpers", () => {
  it("serializes sorted fact-id lists for catalog_digest", () => {
    const ids = ["b.f", "a.f", "record.z"];
    expect(computeCatalogDigest(ids)).toBe(computeJcsSha256Digest([...ids].sort()));
    expect(serializePackJcs({ z: 1, a: 2 })).toBe('{"a":2,"z":1}');
  });

  it("canonical manifest round-trips through JCS", () => {
    const { manifest } = loadManifest(iep200Path);
    const canonical = buildCanonicalPackManifest(manifest);
    expect(computeJcsSha256Digest(canonical)).toBe(GOLDEN_IEP_200.pack_canonical_digest);
  });
});
