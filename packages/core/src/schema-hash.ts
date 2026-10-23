import { createHash } from "node:crypto";

/** Stable hash for extraction schema field definitions and provenance. */
export function computeSchemaHash(payload: {
  intent_text: string;
  fields: unknown[];
  provenance: unknown;
  field_guidance?: unknown[];
}): string {
  const body = JSON.stringify({
    intent_text: payload.intent_text.trim(),
    fields: payload.fields,
    provenance: payload.provenance,
    field_guidance: payload.field_guidance ?? [],
  });
  return createHash("sha256").update(body, "utf8").digest("hex");
}

export function computePackDigest(manifestBytes: string): string {
  return createHash("sha256").update(manifestBytes, "utf8").digest("hex");
}
