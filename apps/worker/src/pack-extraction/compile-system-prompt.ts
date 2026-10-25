import { DOMAIN_PACK_MANIFEST_V2 } from "@hiveforyou/contracts/domain-packs/v2";
import { PACK_EXTRACTION_OUTPUT_JSON_SCHEMA } from "@hiveforyou/contracts/pack-extraction/v1";
import {
  buildPackFactCatalog,
  computeSha256Digest,
  type NormalizedDomainPackManifest,
  type PackFactCatalogResult,
} from "@hiveforyou/core";

import {
  buildDocumentTaxonomySection,
  buildDomainPackSection,
  buildFactCatalogSection,
  assertPackRelationshipsForCompile,
  serializePromptSection,
} from "./compile-sections.js";
import { PackPromptCompileError } from "./errors.js";
import {
  CLASSIFICATION_RULES_TEXT,
  EVIDENCE_AND_MISSING_VALUES_TEXT,
  HIVE_EXTRACTION_RULES_TEXT,
  SECTION_CLASSIFICATION_RULES,
  SECTION_DOCUMENT_TYPES,
  SECTION_DOMAIN_PACK,
  SECTION_EVIDENCE_AND_MISSING_VALUES,
  SECTION_FACT_CATALOG,
  SECTION_HIVE_EXTRACTION_RULES,
  SECTION_OUTPUT_CONTRACT,
} from "./fixed-sections.js";
import { estimatePromptTokensFromBytes } from "./token-estimate.js";
import {
  HIVE_EXTRACTION_RULES_VERSION,
  PACK_EXTRACTION_OUTPUT_CONTRACT_VERSION,
  PACK_EXTRACTION_SYSTEM_TEMPLATE_VERSION,
} from "./versions.js";

export type CompilePackSystemPromptOptions = {
  manifestBytes?: string;
  /** Qualification-only: allow draft packs (production must leave this false). */
  allowDraft?: boolean;
  /** Fail closed when compiled system prompt exceeds this UTF-8 byte length. */
  maxPromptBytes?: number;
};

export type CompiledPackSystemPrompt = {
  system_text: string;
  prompt_digest: string;
  prompt_byte_length: number;
  estimated_prompt_tokens: number;
  prompt_template_version: typeof PACK_EXTRACTION_SYSTEM_TEMPLATE_VERSION;
  extraction_rules_version: typeof HIVE_EXTRACTION_RULES_VERSION;
  output_contract_version: typeof PACK_EXTRACTION_OUTPUT_CONTRACT_VERSION;
  pack_id: string;
  pack_version: string;
  pack_digest: string;
  pack_canonical_digest: string;
  catalog_digest: string;
  catalog_body_digest: string;
  output_schema_digest: string;
  document_type_count: number;
  record_type_count: number;
  catalog_fact_count: number;
  fact_ids: string[];
  catalog: PackFactCatalogResult;
};

export type PackPromptCacheMetadata = {
  prompt_digest: string;
  prompt_byte_length: number;
  estimated_prompt_tokens: number;
  prompt_template_version: string;
  extraction_rules_version: string;
  output_contract_version: string;
  pack_id: string;
  pack_version: string;
  pack_canonical_digest: string;
  catalog_digest: string;
  output_schema_digest: string;
  /** Intended for Oracle LiteLLM provider-side prefix caching (correctness does not depend on hits). */
  cache_strategy: "stable_system_prefix";
};

function assertSupportedManifest(manifest: NormalizedDomainPackManifest, allowDraft: boolean): void {
  if (manifest.contract_version !== DOMAIN_PACK_MANIFEST_V2) {
    throw new PackPromptCompileError("Unsupported domain pack contract version.", [
      {
        code: "UNSUPPORTED_CONTRACT_VERSION",
        message: `Expected ${DOMAIN_PACK_MANIFEST_V2}, got ${manifest.contract_version}.`,
      },
    ]);
  }
  if (manifest.review_status !== "reviewed" && !allowDraft) {
    throw new PackPromptCompileError("Pack is not reviewed.", [
      {
        code: "PACK_NOT_REVIEWED",
        message: `Pack ${manifest.pack_id}@${manifest.pack_version} has review_status=${manifest.review_status}.`,
      },
    ]);
  }
}

function assertCatalogMatchesManifest(
  manifest: NormalizedDomainPackManifest,
  catalog: PackFactCatalogResult,
): void {
  const expectedDocCount = manifest.document_types.length;
  const expectedRecordCount = manifest.record_types?.length ?? 0;
  if (catalog.catalog_fact_count !== catalog.fact_ids.length) {
    throw new PackPromptCompileError("Catalog fact count mismatch.", [
      {
        code: "CATALOG_INCOMPLETE",
        message: "Duplicate or missing fact IDs in compiled catalog.",
      },
    ]);
  }
  if (new Set(catalog.fact_ids).size !== catalog.fact_ids.length) {
    throw new PackPromptCompileError("Duplicate fact IDs in catalog.", [
      { code: "CATALOG_INCOMPLETE", message: "Duplicate fact_id entries detected." },
    ]);
  }
  if (catalog.catalog.record_types.length !== expectedRecordCount) {
    throw new PackPromptCompileError("Record type count mismatch.", [
      {
        code: "CATALOG_INCOMPLETE",
        message: `Expected ${expectedRecordCount} record types, catalog has ${catalog.catalog.record_types.length}.`,
      },
    ]);
  }
  if (expectedDocCount < 1) {
    throw new PackPromptCompileError("Missing document types.", [
      { code: "PROMPT_COMPILE_FAILED", message: "Pack declares no document types." },
    ]);
  }
}

function assembleSystemPrompt(parts: string[]): string {
  return `${parts.join("\n")}\n`;
}

function renderSystemPrompt(
  manifest: NormalizedDomainPackManifest,
  catalog: PackFactCatalogResult,
): string {
  const domainSection = serializePromptSection(buildDomainPackSection(manifest, catalog));
  const documentTypesSection = serializePromptSection(buildDocumentTaxonomySection(manifest));
  const factCatalogSection = serializePromptSection(buildFactCatalogSection(manifest, catalog));
  const outputSchemaSection = serializePromptSection(PACK_EXTRACTION_OUTPUT_JSON_SCHEMA);

  return assembleSystemPrompt([
    SECTION_HIVE_EXTRACTION_RULES,
    HIVE_EXTRACTION_RULES_TEXT,
    SECTION_DOMAIN_PACK,
    domainSection,
    SECTION_DOCUMENT_TYPES,
    documentTypesSection,
    SECTION_CLASSIFICATION_RULES,
    CLASSIFICATION_RULES_TEXT,
    SECTION_FACT_CATALOG,
    factCatalogSection,
    SECTION_EVIDENCE_AND_MISSING_VALUES,
    EVIDENCE_AND_MISSING_VALUES_TEXT,
    SECTION_OUTPUT_CONTRACT,
    outputSchemaSection,
  ]);
}

function assertPromptContainsFullCatalog(systemText: string, catalog: PackFactCatalogResult): void {
  for (const factId of catalog.fact_ids) {
    if (!systemText.includes(factId)) {
      throw new PackPromptCompileError("Compiled prompt missing catalog fact.", [
        {
          code: "CATALOG_INCOMPLETE",
          fact_id: factId,
          message: `Fact ${factId} not present in compiled system prompt.`,
        },
      ]);
    }
  }
}

export function compilePackSystemPrompt(
  manifest: NormalizedDomainPackManifest,
  options: CompilePackSystemPromptOptions = {},
): CompiledPackSystemPrompt {
  const allowDraft = options.allowDraft === true;
  assertSupportedManifest(manifest, allowDraft);
  assertPackRelationshipsForCompile(manifest);

  let catalog: PackFactCatalogResult;
  try {
    catalog = buildPackFactCatalog(manifest, { manifestBytes: options.manifestBytes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fact catalog build failed.";
    throw new PackPromptCompileError(message, [
      { code: "CATALOG_INCOMPLETE", message },
    ]);
  }

  assertCatalogMatchesManifest(manifest, catalog);

  const system_text = renderSystemPrompt(manifest, catalog);
  if (system_text.includes("\r\n")) {
    throw new PackPromptCompileError("Prompt line endings must be LF.", [
      { code: "PROMPT_COMPILE_FAILED", message: "CRLF detected in compiled prompt." },
    ]);
  }

  assertPromptContainsFullCatalog(system_text, catalog);

  const prompt_byte_length = Buffer.byteLength(system_text, "utf8");
  if (options.maxPromptBytes !== undefined && prompt_byte_length > options.maxPromptBytes) {
    throw new PackPromptCompileError("Compiled system prompt exceeds byte budget.", [
      {
        code: "PROMPT_TOO_LARGE",
        message: `Prompt length ${prompt_byte_length} exceeds max ${options.maxPromptBytes}.`,
      },
    ]);
  }

  const prompt_digest = computeSha256Digest(system_text);
  const estimated_prompt_tokens = estimatePromptTokensFromBytes(prompt_byte_length);

  return {
    system_text,
    prompt_digest,
    prompt_byte_length,
    estimated_prompt_tokens,
    prompt_template_version: PACK_EXTRACTION_SYSTEM_TEMPLATE_VERSION,
    extraction_rules_version: HIVE_EXTRACTION_RULES_VERSION,
    output_contract_version: PACK_EXTRACTION_OUTPUT_CONTRACT_VERSION,
    pack_id: manifest.pack_id,
    pack_version: manifest.pack_version,
    pack_digest: catalog.pack_digest,
    pack_canonical_digest: catalog.pack_canonical_digest,
    catalog_digest: catalog.catalog_digest,
    catalog_body_digest: catalog.catalog_body_digest,
    output_schema_digest: catalog.output_schema_digest,
    document_type_count: manifest.document_types.length,
    record_type_count: manifest.record_types?.length ?? 0,
    catalog_fact_count: catalog.catalog_fact_count,
    fact_ids: catalog.fact_ids,
    catalog,
  };
}

/** Observability-safe metadata (no prompt text or pack prose). */
export function summarizeCompiledPackPrompt(result: CompiledPackSystemPrompt): PackPromptCacheMetadata & {
  catalog_body_digest: string;
  document_type_count: number;
  record_type_count: number;
  catalog_fact_count: number;
} {
  return {
    prompt_digest: result.prompt_digest,
    prompt_byte_length: result.prompt_byte_length,
    estimated_prompt_tokens: result.estimated_prompt_tokens,
    prompt_template_version: result.prompt_template_version,
    extraction_rules_version: result.extraction_rules_version,
    output_contract_version: result.output_contract_version,
    pack_id: result.pack_id,
    pack_version: result.pack_version,
    pack_canonical_digest: result.pack_canonical_digest,
    catalog_digest: result.catalog_digest,
    catalog_body_digest: result.catalog_body_digest,
    output_schema_digest: result.output_schema_digest,
    document_type_count: result.document_type_count,
    record_type_count: result.record_type_count,
    catalog_fact_count: result.catalog_fact_count,
    cache_strategy: "stable_system_prefix",
  };
}
