import type {
  ExtractionSchemaFieldV1,
  MatchTierV1,
} from "@hiveforyou/contracts/extraction/v1";
import type { DomainPackFieldDefV1 } from "@hiveforyou/contracts/domain-packs/v1";
import { ErrorCode } from "@hiveforyou/contracts/errors/v1";

import { PlanningError } from "./errors.js";
import {
  FIELD_KEY_PATTERN,
  SCHEMA_LIMITS,
  VALUE_TYPES,
} from "./schema-validate.js";
import type { ReasoningJsonClient, ReasoningJsonResult } from "../reasoning/types.js";

const GENERATE_SYSTEM_PROMPT = [
  "Propose an extraction schema for the user intent and the supplied document.",
  "Return JSON with a fields array.",
  "Each field needs field_key (snake_case), title, value_type, evidence_required true,",
  "reusable, and required_for_intent.",
  "value_type must be string, number, date, boolean, object, or array.",
  "Include reusable document facts that stay useful for other intents,",
  "and separate fields prioritized for this intent.",
  "Ground fields in the supplied pages and sections.",
  "Pack hints are optional. Do not copy a fixed template.",
  "Do not include extracted values or quotes.",
].join(" ");

const SUPPLEMENT_SYSTEM_PROMPT = [
  "The document already has a declarative field structure.",
  "Return JSON with a fields array containing only additional fields required by the user intent.",
  "Do not repeat existing field keys.",
  "Each field needs field_key, title, value_type, evidence_required true, reusable, and required_for_intent.",
  "value_type must be string, number, date, boolean, object, or array.",
  "Ground new fields in the supplied pages and sections.",
  "Do not include extracted values or quotes.",
].join(" ");

function invalid(reason: string, message: string): PlanningError {
  return new PlanningError(ErrorCode.MODEL_OUTPUT_INVALID, message, { reason });
}

export function parseGeneratedFields(raw: unknown): ExtractionSchemaFieldV1[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw invalid("schema_response_invalid", "Model schema response must be an object.");
  }
  const fields = (raw as { fields?: unknown }).fields;
  if (!Array.isArray(fields) || fields.length < 1) {
    throw invalid("missing_fields", "Model schema response is missing fields.");
  }
  if (fields.length > SCHEMA_LIMITS.maxFields) {
    throw invalid("too_many_fields", "Model schema exceeds the field limit.");
  }
  const seen = new Set<string>();
  return fields.map((entry) => parseField(entry, seen));
}

function parseField(entry: unknown, seen: Set<string>): ExtractionSchemaFieldV1 {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw invalid("schema_field_invalid", "Schema field must be an object.");
  }
  const raw = entry as Record<string, unknown>;
  if (typeof raw.field_key !== "string" || !FIELD_KEY_PATTERN.test(raw.field_key)) {
    throw invalid("invalid_field_key", "Schema field_key is invalid.");
  }
  if (seen.has(raw.field_key)) {
    throw invalid("duplicate_field_key", "Schema field_key is duplicated.");
  }
  seen.add(raw.field_key);
  if (typeof raw.title !== "string" || !raw.title.trim() || raw.title.length > SCHEMA_LIMITS.maxTitleLength) {
    throw invalid("invalid_title", "Schema field title is invalid.");
  }
  if (typeof raw.value_type !== "string" || !VALUE_TYPES.has(raw.value_type)) {
    throw invalid("invalid_value_type", "Schema field type is unsupported.");
  }
  if (raw.evidence_required !== true) {
    throw invalid("evidence_required", "Schema fields must require source evidence.");
  }
  if (typeof raw.reusable !== "boolean" || typeof raw.required_for_intent !== "boolean") {
    throw invalid("field_flags", "Schema fields must set reusable and required_for_intent.");
  }
  let description: string | undefined;
  if (raw.description != null) {
    if (typeof raw.description !== "string" || raw.description.length > SCHEMA_LIMITS.maxDescriptionLength) {
      throw invalid("invalid_description", "Schema field description is invalid.");
    }
    if (raw.description.trim()) {
      description = raw.description.trim();
    }
  }
  let required: boolean | undefined;
  if (raw.required != null) {
    if (typeof raw.required !== "boolean") {
      throw invalid("field_flags", "Schema field required flag is invalid.");
    }
    required = raw.required;
  }

  return {
    field_key: raw.field_key,
    title: raw.title.trim(),
    ...(description ? { description } : {}),
    value_type: raw.value_type as ExtractionSchemaFieldV1["value_type"],
    ...(required != null ? { required } : {}),
    reusable: raw.reusable,
    evidence_required: true,
    required_for_intent: raw.required_for_intent,
  };
}

export function mergeReusableFacts(
  reusable: ExtractionSchemaFieldV1[],
  generated: ExtractionSchemaFieldV1[],
): ExtractionSchemaFieldV1[] {
  const seen = new Set<string>();
  const merged: ExtractionSchemaFieldV1[] = [];
  for (const field of reusable) {
    if (seen.has(field.field_key)) {
      continue;
    }
    seen.add(field.field_key);
    merged.push({ ...field, reusable: true });
  }
  for (const field of generated) {
    if (seen.has(field.field_key)) {
      continue;
    }
    seen.add(field.field_key);
    merged.push(field);
  }
  return merged;
}

export function mergeSupplementalFields(
  existing: ExtractionSchemaFieldV1[],
  supplemental: ExtractionSchemaFieldV1[],
): ExtractionSchemaFieldV1[] {
  const keys = new Set(existing.map((field) => field.field_key));
  const novel = supplemental
    .filter((field) => !keys.has(field.field_key))
    .map((field) => ({ ...field, required_for_intent: true }));
  if (novel.length === 0) {
    throw invalid("no_intent_fields", "Model did not return intent-specific fields.");
  }
  return [...existing, ...novel];
}

function hintPayload(fields: DomainPackFieldDefV1[]): Record<string, unknown>[] {
  return fields.slice(0, SCHEMA_LIMITS.maxFields).map((field) => ({
    field_key: field.field_key,
    title: field.title,
    value_type: field.value_type,
    reusable: field.reusable === true,
  }));
}

type SchemaCallContext = {
  client: ReasoningJsonClient;
  correlationId?: string;
  intentText: string;
  sections: { label: string; page_start: number; page_end: number }[];
  pages: { page_number: number; text: string }[];
};

async function completeSchema(
  context: SchemaCallContext,
  task: "generate_schema" | "supplement_schema",
  systemPrompt: string,
  userPayload: Record<string, unknown>,
): Promise<ReasoningJsonResult & { fields: ExtractionSchemaFieldV1[] }> {
  const result = await context.client.completeJson({
    task,
    systemPrompt,
    userPayload,
    correlationId: context.correlationId,
  });
  return { ...result, fields: parseGeneratedFields(result.parsed) };
}

export async function requestGeneratedSchema(
  context: SchemaCallContext & {
    matchTier: Extract<MatchTierV1, "partial" | "generic">;
    hintFields: DomainPackFieldDefV1[];
  },
): Promise<{ fields: ExtractionSchemaFieldV1[]; alias: string; durationMs: number }> {
  const result = await completeSchema(context, "generate_schema", GENERATE_SYSTEM_PROMPT, {
    intent_text: context.intentText,
    match_tier: context.matchTier,
    sections: context.sections,
    pages: context.pages,
    hint_fields: hintPayload(context.hintFields),
  });
  return { fields: result.fields, alias: result.alias, durationMs: result.durationMs };
}

export async function requestSupplementalSchema(
  context: SchemaCallContext & {
    documentTypeId: string;
    existingFields: ExtractionSchemaFieldV1[];
  },
): Promise<{ fields: ExtractionSchemaFieldV1[]; alias: string; durationMs: number }> {
  const result = await completeSchema(context, "supplement_schema", SUPPLEMENT_SYSTEM_PROMPT, {
    intent_text: context.intentText,
    match_tier: "exact",
    document_type_id: context.documentTypeId,
    sections: context.sections,
    pages: context.pages,
    existing_fields: context.existingFields.map((field) => ({
      field_key: field.field_key,
      title: field.title,
      value_type: field.value_type,
    })),
  });
  return {
    fields: mergeSupplementalFields(context.existingFields, result.fields),
    alias: result.alias,
    durationMs: result.durationMs,
  };
}
