import { randomUUID } from "node:crypto";

import {
  EXTRACTION_SCHEMA_VERSION,
  type DocumentClassificationV1,
  type ExtractionSchemaFieldV1,
  type ExtractionSchemaV1,
} from "@hiveforyou/contracts/extraction/v1";
import type { DomainPackManifestV1 } from "@hiveforyou/contracts/domain-packs/v1";
import type { DomainPackManifestV2 } from "@hiveforyou/contracts/domain-packs/v2";
import { ErrorCode } from "@hiveforyou/contracts/errors/v1";
import { buildFieldGuidanceForDocumentType, computeSchemaHash } from "@hiveforyou/core";

import { AMBIGUITY_MULTIPLE_DOMAINS, type ClassifyDocumentInputV1 } from "./classify.js";
import { PlanningError } from "./errors.js";
import { intentNeedsSupplementalFields } from "./intent-coverage.js";
import { selectMatchTier, type MatchSelectionV1 } from "./match.js";
import { resolveDocumentClassification } from "./model-classify.js";
import {
  mergeReusableFacts,
  requestGeneratedSchema,
  requestSupplementalSchema,
} from "./model-schema.js";
import { emitPlanningLog } from "./observability.js";
import { excerptPages } from "./page-excerpt.js";
import { assertPlannedSchema } from "./schema-validate.js";
import { createLiteLlmReasoningClient } from "../reasoning/litellm-client.js";
import type { ReasoningJsonClient } from "../reasoning/types.js";

export type PlanSchemaInputV1 = {
  intent_text: string;
  classification: DocumentClassificationV1;
  combinedPageText: string;
  packs: { manifest: DomainPackManifestV1 | DomainPackManifestV2; digest: string }[];
  pages?: { page_number: number; text: string }[];
  extraction_schema_id?: string;
  correlation_id?: string;
  study_run_id?: string;
  reasoning?: ReasoningJsonClient;
};

export type PrepareExtractionPlanInputV1 = {
  classificationInput: ClassifyDocumentInputV1;
  intent_text: string;
  packs: { manifest: DomainPackManifestV1 | DomainPackManifestV2; digest: string }[];
  extraction_schema_id?: string;
  correlation_id?: string;
  study_run_id?: string;
  reasoning?: ReasoningJsonClient;
};

function intentTokens(intent: string): string[] {
  return intent
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}

function markIntentFields(
  fields: ExtractionSchemaFieldV1[],
  intent: string,
): ExtractionSchemaFieldV1[] {
  const tokens = intentTokens(intent);
  return fields.map((field) => {
    const haystack = `${field.field_key} ${field.title} ${field.description ?? ""}`.toLowerCase();
    const matched = tokens.some((token) => haystack.includes(token));
    return {
      ...field,
      required_for_intent: field.required_for_intent === true || matched,
    };
  });
}

function fieldsFromDocumentType(
  manifest: DomainPackManifestV1 | DomainPackManifestV2,
  documentTypeId: string,
): ExtractionSchemaFieldV1[] {
  const docType = manifest.document_types.find(
    (entry) => entry.document_type_id === documentTypeId,
  );
  const structureFields =
    docType && "structure" in docType && docType.structure?.fields
      ? docType.structure.fields
      : [];
  return structureFields.map((field) => ({ ...field }));
}

function hintFieldsForDomain(
  manifest: DomainPackManifestV1 | DomainPackManifestV2,
  domainId: string,
): ExtractionSchemaFieldV1[] {
  const domain = manifest.domains.find((entry) => entry.domain_id === domainId);
  const vocabulary = domain?.vocabulary_fields?.map((field) => ({ ...field })) ?? [];
  const docFields = manifest.document_types
    .filter((entry) => entry.domain_id === domainId)
    .flatMap((entry) => entry.structure.fields.map((field) => ({ ...field })));
  const byKey = new Map<string, ExtractionSchemaFieldV1>();
  for (const field of [...vocabulary, ...docFields]) {
    byKey.set(field.field_key, field);
  }
  return [...byKey.values()];
}

function reusableVocabularyFields(
  manifest: DomainPackManifestV1 | DomainPackManifestV2,
  domainId: string,
): ExtractionSchemaFieldV1[] {
  const domain = manifest.domains.find((entry) => entry.domain_id === domainId);
  return (
    domain?.vocabulary_fields
      ?.filter((field) => field.reusable === true)
      .map((field) => ({ ...field, reusable: true })) ?? []
  );
}

function requirePack(
  packs: PlanSchemaInputV1["packs"],
  packId: string,
): { manifest: DomainPackManifestV1 | DomainPackManifestV2; digest: string } {
  const pack = packs.find((entry) => entry.manifest.pack_id === packId);
  if (!pack) {
    throw new PlanningError(ErrorCode.INVALID_REQUEST, "Matched pack is missing from the loaded catalog.", {
      reason: "pack_missing",
    });
  }
  return pack;
}

function requireReasoning(input: PlanSchemaInputV1): ReasoningJsonClient {
  if (input.reasoning) {
    return input.reasoning;
  }
  return createLiteLlmReasoningClient();
}

function requirePageExcerpts(
  pages: PlanSchemaInputV1["pages"],
): { page_number: number; text: string }[] {
  if (!pages?.length || !pages.some((page) => page.text.trim())) {
    throw new PlanningError(
      ErrorCode.INVALID_REQUEST,
      "Document pages are required to generate a schema.",
      { reason: "missing_pages" },
    );
  }
  return excerptPages(pages);
}

function buildSchema(
  input: PlanSchemaInputV1,
  selection: MatchSelectionV1,
  fields: ExtractionSchemaFieldV1[],
  generic: boolean,
  fieldGuidance: ExtractionSchemaV1["field_guidance"],
): ExtractionSchemaV1 {
  const extraction_schema_id = input.extraction_schema_id ?? randomUUID();
  const intentFields = markIntentFields(fields, input.intent_text);
  const provenance = {
    match_tier: selection.match_tier,
    pack_id: selection.pack_id,
    pack_version: selection.pack_version,
    pack_digest: selection.pack_digest,
    document_type_id: selection.document_type_id,
    domain_id: selection.domain_id,
  };
  const schema_hash = computeSchemaHash({
    intent_text: input.intent_text,
    fields: intentFields,
    provenance,
    field_guidance: fieldGuidance,
  });

  return {
    contract_version: EXTRACTION_SCHEMA_VERSION,
    extraction_schema_id,
    schema_hash,
    intent_text: input.intent_text,
    fields: intentFields,
    provenance,
    generic,
    field_guidance: fieldGuidance,
  };
}

export async function planExtractionSchema(
  input: PlanSchemaInputV1,
): Promise<ExtractionSchemaV1> {
  const started = Date.now();
  let modelAlias: string | null = null;
  let selection: MatchSelectionV1 | undefined;
  try {
    if (!input.intent_text.trim()) {
      throw new PlanningError(ErrorCode.INVALID_REQUEST, "Intent text is required.", {
        reason: "missing_intent",
      });
    }
    selection = selectMatchTier(
      input.classification,
      input.packs,
      input.combinedPageText,
    );
    if (input.classification.ambiguity_notes.includes(AMBIGUITY_MULTIPLE_DOMAINS)) {
      selection = {
        match_tier: "generic",
        pack_id: null,
        pack_version: null,
        pack_digest: null,
        domain_id: null,
        document_type_id: null,
        receipt_like_score: selection.receipt_like_score,
      };
    }

    let fields: ExtractionSchemaFieldV1[];
    let generic: boolean;
    let fieldGuidance: ExtractionSchemaV1["field_guidance"];

    if (selection.match_tier === "exact" && selection.document_type_id && selection.pack_id) {
      const pack = requirePack(input.packs, selection.pack_id);
      fields = fieldsFromDocumentType(pack.manifest, selection.document_type_id);
      fieldGuidance = buildFieldGuidanceForDocumentType(
        pack.manifest,
        selection.document_type_id,
      );
      if (intentNeedsSupplementalFields(input.intent_text, fields)) {
        const pages = requirePageExcerpts(input.pages);
        const generated = await requestSupplementalSchema({
          client: requireReasoning(input),
          correlationId: input.correlation_id,
          intentText: input.intent_text,
          sections: input.classification.detected_sections,
          pages,
          documentTypeId: selection.document_type_id,
          existingFields: fields,
        });
        modelAlias = generated.alias;
        fields = generated.fields;
      }
      generic = false;
    } else if (selection.match_tier === "partial" && selection.domain_id && selection.pack_id) {
      fieldGuidance = undefined;
      const pack = requirePack(input.packs, selection.pack_id);
      const pages = requirePageExcerpts(input.pages);
      const generated = await requestGeneratedSchema({
        client: requireReasoning(input),
        correlationId: input.correlation_id,
        intentText: input.intent_text,
        sections: input.classification.detected_sections,
        pages,
        matchTier: "partial",
        hintFields: hintFieldsForDomain(pack.manifest, selection.domain_id),
      });
      modelAlias = generated.alias;
      fields = mergeReusableFacts(
        reusableVocabularyFields(pack.manifest, selection.domain_id),
        generated.fields,
      );
      generic = false;
    } else {
      fieldGuidance = undefined;
      const pages = requirePageExcerpts(input.pages);
      const generated = await requestGeneratedSchema({
        client: requireReasoning(input),
        correlationId: input.correlation_id,
        intentText: input.intent_text,
        sections: input.classification.detected_sections,
        pages,
        matchTier: "generic",
        hintFields: [],
      });
      modelAlias = generated.alias;
      fields = generated.fields;
      generic = true;
    }

    const schema = buildSchema(input, selection, fields, generic, fieldGuidance);
    assertPlannedSchema(schema);
    emitPlanningLog({
      level: "info",
      stage: "plan_schema",
      correlation_id: input.correlation_id ?? null,
      study_run_id: input.study_run_id ?? null,
      source_document_id: input.classification.source_document_id,
      classification_quality: input.classification.classification_quality,
      domain_id: schema.provenance.domain_id,
      document_type_id: schema.provenance.document_type_id,
      match_tier: schema.provenance.match_tier,
      pack_digest: schema.provenance.pack_digest,
      schema_hash: schema.schema_hash,
      model_alias: modelAlias,
      duration_ms: Date.now() - started,
    });
    return schema;
  } catch (error) {
    const planning = error instanceof PlanningError ? error : null;
    emitPlanningLog({
      level: "error",
      stage: "plan_schema",
      correlation_id: input.correlation_id ?? null,
      study_run_id: input.study_run_id ?? null,
      source_document_id: input.classification.source_document_id,
      classification_quality: input.classification.classification_quality,
      match_tier: selection?.match_tier,
      pack_digest: selection?.pack_digest ?? null,
      model_alias:
        modelAlias ??
        (typeof planning?.diagnostics.alias === "string" ? planning.diagnostics.alias : null),
      duration_ms: Date.now() - started,
      error_code: planning?.errorCode ?? ErrorCode.EXTRACTION_FAILED,
      retryable: planning?.retryable ?? false,
      message_safe: planning?.message ?? "Schema planning failed.",
      failure_reason:
        typeof planning?.diagnostics.reason === "string"
          ? planning.diagnostics.reason
          : "unexpected",
    });
    throw error;
  }
}

export async function prepareExtractionPlan(
  input: PrepareExtractionPlanInputV1,
): Promise<{ classification: DocumentClassificationV1; schema: ExtractionSchemaV1 }> {
  const correlation_id = input.correlation_id ?? input.classificationInput.correlation_id;
  const study_run_id = input.study_run_id ?? input.classificationInput.study_run_id;
  const classification = await resolveDocumentClassification(
    {
      ...input.classificationInput,
      correlation_id,
      study_run_id,
    },
    input.reasoning,
  );
  const schema = await planExtractionSchema({
    intent_text: input.intent_text,
    classification,
    combinedPageText: input.classificationInput.pages.map((page) => page.text).join("\n"),
    pages: input.classificationInput.pages,
    packs: input.packs,
    extraction_schema_id: input.extraction_schema_id,
    correlation_id,
    study_run_id,
    reasoning: input.reasoning,
  });
  return { classification, schema };
}
