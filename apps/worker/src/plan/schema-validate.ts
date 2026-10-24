import type { ExtractionSchemaV1 } from "@hiveforyou/contracts/extraction/v1";
import { ErrorCode } from "@hiveforyou/contracts/errors/v1";
import { computeSchemaHash } from "@hiveforyou/core";

import { PlanningError } from "./errors.js";

export const SCHEMA_LIMITS = {
  maxFields: 40,
  maxTitleLength: 160,
  maxDescriptionLength: 500,
  maxSchemaJsonBytes: 48_000,
} as const;

export const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

const FIELD_KEY_MAX_LENGTH = 64;

/** Safe planning log category when a model field_key fails validation (never log raw keys). */
export type ModelFieldKeyFailureCategory =
  | "empty"
  | "dot_separator"
  | "hyphen"
  | "invalid_prefix"
  | "too_long"
  | "invalid_character";

export type NormalizeModelFieldKeyResult =
  | { ok: true; field_key: string }
  | { ok: false; category: ModelFieldKeyFailureCategory };

/**
 * Deterministic normalization for model-generated supplemental / generated schema fields only.
 * Pack-derived and persisted field keys must already match {@link FIELD_KEY_PATTERN}.
 */
export function normalizeModelGeneratedFieldKey(raw: string): NormalizeModelFieldKeyResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, category: "empty" };
  }

  const hadDot = trimmed.includes(".");
  const hadHyphen = trimmed.includes("-");
  const normalized = trimmed.toLowerCase().replace(/[.-]/g, "_");

  if (FIELD_KEY_PATTERN.test(normalized)) {
    return { ok: true, field_key: normalized };
  }

  if (normalized.length > FIELD_KEY_MAX_LENGTH) {
    return { ok: false, category: "too_long" };
  }
  if (!/^[a-z]/.test(normalized)) {
    return { ok: false, category: "invalid_prefix" };
  }
  if (/[^a-z0-9_]/.test(normalized)) {
    return { ok: false, category: "invalid_character" };
  }
  if (hadDot) {
    return { ok: false, category: "dot_separator" };
  }
  if (hadHyphen) {
    return { ok: false, category: "hyphen" };
  }
  return { ok: false, category: "invalid_character" };
}

export const VALUE_TYPES = new Set([
  "string",
  "number",
  "date",
  "boolean",
  "object",
  "array",
]);

function invalid(reason: string, message: string): PlanningError {
  return new PlanningError(ErrorCode.MODEL_OUTPUT_INVALID, message, { reason });
}

export function assertPlannedSchema(schema: ExtractionSchemaV1): void {
  const fields = schema.fields;
  if (!Array.isArray(fields) || fields.length < 1) {
    throw invalid("missing_fields", "Extraction schema has no fields.");
  }
  if (fields.length > SCHEMA_LIMITS.maxFields) {
    throw invalid("too_many_fields", "Extraction schema exceeds the field limit.");
  }

  const seen = new Set<string>();
  for (const field of fields) {
    if (!FIELD_KEY_PATTERN.test(field.field_key)) {
      throw invalid("invalid_field_key", "Extraction schema has an invalid field key.");
    }
    if (seen.has(field.field_key)) {
      throw invalid("duplicate_field_key", "Extraction schema repeats a field key.");
    }
    seen.add(field.field_key);
    if (!field.title.trim() || field.title.length > SCHEMA_LIMITS.maxTitleLength) {
      throw invalid("invalid_title", "Extraction schema has an invalid field title.");
    }
    if (
      field.description != null &&
      field.description.length > SCHEMA_LIMITS.maxDescriptionLength
    ) {
      throw invalid("invalid_description", "Extraction schema field description is too long.");
    }
    if (!VALUE_TYPES.has(field.value_type)) {
      throw invalid("invalid_value_type", "Extraction schema has an unsupported field type.");
    }
    if (field.evidence_required !== true) {
      throw invalid(
        "evidence_required",
        "Extraction schema fields must require source evidence.",
      );
    }
  }

  const encodedBytes = Buffer.byteLength(JSON.stringify(fields), "utf8");
  if (encodedBytes > SCHEMA_LIMITS.maxSchemaJsonBytes) {
    throw invalid("schema_too_large", "Extraction schema exceeds the size limit.");
  }

  if (schema.provenance.match_tier !== "exact") {
    if (!fields.some((field) => field.reusable === true)) {
      throw invalid(
        "missing_reusable_fact",
        "Generated schema is missing reusable document facts.",
      );
    }
    if (!fields.some((field) => field.required_for_intent === true)) {
      throw invalid(
        "missing_intent_field",
        "Generated schema is missing intent-specific fields.",
      );
    }
  }

  const expected = computeSchemaHash({
    intent_text: schema.intent_text,
    fields: schema.fields,
    provenance: schema.provenance,
    field_guidance: schema.field_guidance,
  });
  if (expected !== schema.schema_hash || !/^[a-f0-9]{64}$/.test(schema.schema_hash)) {
    throw invalid("schema_hash", "Schema hash did not match the canonical field definition.");
  }
}
