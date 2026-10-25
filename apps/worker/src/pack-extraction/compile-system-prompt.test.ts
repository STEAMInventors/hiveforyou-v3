import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parsePackExtractionInputV1 } from "@hiveforyou/contracts/pack-extraction/v1";
import {
  buildPackFactCatalog,
  computeSha256Digest,
  normalizeDomainPackManifest,
  parsePackManifest,
  resolvePackCatalog,
} from "@hiveforyou/core";

import { loadDomainPacksFromRoot } from "../packs/load-packs.js";
import { buildPackExtractionUserMessage } from "./build-user-message.js";
import { compilePackSystemPrompt } from "./compile-system-prompt.js";
import { HIVE_EXTRACTION_RULES_TEXT } from "./fixed-sections.js";
import { PackPromptCompileError } from "./errors.js";

const repoRoot = join(process.cwd(), "../..");
const iep210Path = join(repoRoot, "domain-packs/iep/2.1.0/manifest.json");
const iep200Path = join(repoRoot, "domain-packs/iep/2.0.0/manifest.json");
const packsRoot = join(repoRoot, "domain-packs");

function loadIep210() {
  const bytes = readFileSync(iep210Path, "utf8");
  const manifest = normalizeDomainPackManifest(parsePackManifest(JSON.parse(bytes)));
  return { bytes, manifest };
}

describe("compilePackSystemPrompt — IEP 2.1.0 (draft qualification pin)", () => {
  const { bytes, manifest } = loadIep210();
  const compiled = compilePackSystemPrompt(manifest, { manifestBytes: bytes, allowDraft: true });
  const catalog = buildPackFactCatalog(manifest, { manifestBytes: bytes });

  it("produces byte-identical prompts on repeated compile", () => {
    const again = compilePackSystemPrompt(manifest, { manifestBytes: bytes, allowDraft: true });
    expect(again.system_text).toBe(compiled.system_text);
    expect(again.prompt_digest).toBe(compiled.prompt_digest);
  });

  it("uses the same system prompt for two different user documents", () => {
    const userA = buildPackExtractionUserMessage({
      prompt_digest: compiled.prompt_digest,
      source_ref_id: "src-a",
      source_sha256: "a".repeat(64),
      read_fingerprint: "fp-a",
      mime_family: "pdf",
      page_count: 1,
      window: { page_start: 1, page_end: 1, is_partial: false },
      pages_meta: [{ page_number: 1, extraction_method: "native_text", quality: "good" }],
      pages: [
        {
          page_number: 1,
          text: "<<<PAGE 1 BEGIN>>>\nZZZUSERDOC_ALPHA_UNIQUE\n<<<PAGE 1 END>>>",
        },
      ],
    });
    const userB = buildPackExtractionUserMessage({
      prompt_digest: compiled.prompt_digest,
      source_ref_id: "src-b",
      source_sha256: "b".repeat(64),
      read_fingerprint: "fp-b",
      mime_family: "pdf",
      page_count: 2,
      window: { page_start: 1, page_end: 2, is_partial: false },
      pages_meta: [
        { page_number: 1, extraction_method: "native_text", quality: "good" },
        { page_number: 2, extraction_method: "native_text", quality: "good" },
      ],
      pages: [
        {
          page_number: 1,
          text: "<<<PAGE 1 BEGIN>>>\nZZZUSERDOC_BETA_UNIQUE\n<<<PAGE 1 END>>>",
        },
        {
          page_number: 2,
          text: "<<<PAGE 2 BEGIN>>>\nZZZUSERDOC_GAMMA_UNIQUE\n<<<PAGE 2 END>>>",
        },
      ],
    });
    expect(userA.prompt_digest).toBe(userB.prompt_digest);
    expect(compiled.system_text).not.toContain("ZZZUSERDOC_ALPHA_UNIQUE");
    expect(compiled.system_text).not.toContain("ZZZUSERDOC_BETA_UNIQUE");
    expect(parsePackExtractionInputV1(userA).ok).toBe(true);
    expect(parsePackExtractionInputV1(userB).ok).toBe(true);
  });

  it("includes all 19 document types, 27 record types, and 150 facts exactly once", () => {
    expect(compiled.document_type_count).toBe(19);
    expect(compiled.record_type_count).toBe(27);
    expect(compiled.catalog_fact_count).toBe(150);
    expect(new Set(compiled.fact_ids).size).toBe(150);
    expect(compiled.fact_ids.sort()).toEqual([...catalog.fact_ids].sort());
    for (const docType of manifest.document_types) {
      expect(compiled.system_text).toContain(docType.document_type_id);
    }
  });

  it("preserves nested fact IDs", () => {
    expect(compiled.fact_ids).toContain("goal.measure.score_type");
    expect(compiled.system_text).toContain("goal.measure.score_type");
  });

  it("reflects intentional identity changes for goal, evaluation_plan_item, and meeting_participant", () => {
    expect(compiled.system_text).toContain('"measure.task"');
    expect(compiled.system_text).toContain('"measure.score_type"');
    const epi = manifest.record_types!.find((r) => r.record_type_id === "evaluation_plan_item")!;
    expect(compiled.system_text).toContain(JSON.stringify(epi.identity.key_fields));
    expect(compiled.system_text).toContain('"list_section"');
    const participant = manifest.record_types!.find((r) => r.record_type_id === "meeting_participant")!;
    expect(compiled.system_text).toContain(JSON.stringify(participant.identity.key_fields));
    expect(compiled.system_text).toContain('"role_code"');
  });

  it("matches catalog digests from Core", () => {
    expect(compiled.catalog_digest).toBe(catalog.catalog_digest);
    expect(compiled.catalog_body_digest).toBe(catalog.catalog_body_digest);
    expect(compiled.pack_canonical_digest).toBe(catalog.pack_canonical_digest);
    expect(compiled.output_schema_digest).toBe(catalog.output_schema_digest);
  });

  it("computes prompt_digest from exact UTF-8 system bytes", () => {
    expect(compiled.prompt_digest).toBe(computeSha256Digest(compiled.system_text));
    expect(compiled.prompt_byte_length).toBe(Buffer.byteLength(compiled.system_text, "utf8"));
    expect(compiled.system_text.endsWith("\n")).toBe(true);
    expect(compiled.system_text.includes("\r\n")).toBe(false);
  });

  it("changes prompt_digest when a fact description changes", () => {
    const tweaked = structuredClone(manifest);
    const goal = tweaked.record_types!.find((r) => r.record_type_id === "goal")!;
    const field = goal.fields.find((f) => f.field_id === "statement")!;
    field.description = `${field.description ?? ""} (digest tweak)`;
    const next = compilePackSystemPrompt(tweaked, { allowDraft: true });
    expect(next.prompt_digest).not.toBe(compiled.prompt_digest);
    expect(next.catalog_digest).toBe(compiled.catalog_digest);
  });

  it("changes prompt_digest when enum or record identity changes", () => {
    const enumTweak = structuredClone(manifest);
    const goal = enumTweak.record_types!.find((r) => r.record_type_id === "goal")!;
    const scoreType = goal.fields.find((f) => f.field_id === "measure.score_type")!;
    scoreType.enum = [...(scoreType.enum ?? [])].reverse();
    expect(compilePackSystemPrompt(enumTweak, { allowDraft: true }).prompt_digest).not.toBe(
      compiled.prompt_digest,
    );

    const identityTweak = structuredClone(manifest);
    const epi = identityTweak.record_types!.find((r) => r.record_type_id === "evaluation_plan_item")!;
    epi.identity.key_fields = [...epi.identity.key_fields].reverse();
    expect(compilePackSystemPrompt(identityTweak, { allowDraft: true }).prompt_digest).not.toBe(
      compiled.prompt_digest,
    );
  });

  it("changes prompt_digest when extraction rules text changes", () => {
    expect(compiled.system_text).toContain(HIVE_EXTRACTION_RULES_TEXT);
    const tweakedRules = compiled.system_text.replace(
      HIVE_EXTRACTION_RULES_TEXT,
      `${HIVE_EXTRACTION_RULES_TEXT}\n13. Qualification-only rule touch.`,
    );
    expect(computeSha256Digest(tweakedRules)).not.toBe(compiled.prompt_digest);
  });

  it("does not embed document text, filenames, intent, or runtime IDs in the system prompt", () => {
    const forbidden = [
      "user_intent",
      "study_run_id",
      "hive_id",
      "03_iep_team_meeting_notes.pdf",
      "My child",
    ];
    for (const token of forbidden) {
      expect(compiled.system_text).not.toContain(token);
    }
  });
});

describe("compilePackSystemPrompt — negative paths", () => {
  const { bytes, manifest } = loadIep210();

  it("rejects draft packs unless allowDraft is set", () => {
    expect(() => compilePackSystemPrompt(manifest, { manifestBytes: bytes })).toThrow(
      PackPromptCompileError,
    );
  });

  it("rejects malformed checklist references", () => {
    const broken = structuredClone(manifest);
    const doc = broken.document_types.find((d) => d.document_type_id === "iep.plan")!;
    if ("checklist" in doc && Array.isArray(doc.checklist)) {
      doc.checklist.push("not_a_record");
    }
    expect(() => compilePackSystemPrompt(broken, { allowDraft: true })).toThrow(PackPromptCompileError);
  });

  it("rejects incomplete catalogs", () => {
    const broken = structuredClone(manifest);
    const goal = broken.record_types!.find((r) => r.record_type_id === "goal")!;
    goal.fields.push({ ...goal.fields[0]! });
    expect(() => compilePackSystemPrompt(broken, { allowDraft: true })).toThrow(PackPromptCompileError);
  });

  it("fails when maxPromptBytes is exceeded", () => {
    expect(() =>
      compilePackSystemPrompt(manifest, { manifestBytes: bytes, allowDraft: true, maxPromptBytes: 100 }),
    ).toThrow(PackPromptCompileError);
  });
});

describe("compilePackSystemPrompt — production pack selection unchanged", () => {
  it("keeps reviewed IEP 2.0.0 under reviewedOnly catalog resolution", () => {
    const result = loadDomainPacksFromRoot(packsRoot, { reviewedOnly: true });
    const iep = result.packs.find((p) => p.manifest.pack_id === "iep");
    expect(iep?.manifest.pack_version).toBe("2.0.0");
    const compiled = compilePackSystemPrompt(iep!.manifest, { manifestBytes: readFileSync(iep200Path, "utf8") });
    expect(compiled.catalog_fact_count).toBe(131);
    expect(compiled.document_type_count).toBe(15);
  });

  it("does not promote draft 2.1.0 when unpinned", () => {
    const bytes210 = readFileSync(iep210Path, "utf8");
    const resolved = resolvePackCatalog(
      [
        { manifestPath: iep200Path, bytes: readFileSync(iep200Path, "utf8") },
        { manifestPath: iep210Path, bytes: bytes210 },
      ],
      { reviewedOnly: true },
    );
    expect(resolved.packs.find((p) => p.manifest.pack_id === "iep")?.manifest.pack_version).toBe("2.0.0");
  });
});
