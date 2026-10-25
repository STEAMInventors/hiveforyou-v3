/** JSON Schema instance embedded in compiled prompts (JCS-digest source for output_schema_digest). */
export const PACK_EXTRACTION_OUTPUT_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://hiveforyou.dev/schemas/pack-extraction-output.v1.json",
  title: "PackExtractionOutputV1",
  type: "object",
  additionalProperties: false,
  required: ["contract_version", "prompt_digest", "source_ref_id", "classification", "records"],
  properties: {
    contract_version: { const: "pack-extraction-output@1" },
    prompt_digest: {
      type: "string",
      pattern: "^sha256:[0-9a-f]{64}$",
    },
    source_ref_id: { type: "string", minLength: 1, maxLength: 128 },
    classification: {
      type: "object",
      additionalProperties: false,
      required: ["status"],
      properties: {
        status: {
          type: "string",
          enum: ["CLASSIFIED", "AMBIGUOUS", "COMPOUND", "UNRECOGNIZED"],
        },
        primary_document_type_id: { type: "string", minLength: 1, maxLength: 128 },
        candidates: {
          type: "array",
          items: { $ref: "#/$defs/classificationCandidate" },
        },
        segments: {
          type: "array",
          items: { $ref: "#/$defs/classificationSegment" },
        },
      },
    },
    records: {
      type: "array",
      items: { $ref: "#/$defs/record" },
    },
    missing_facts: {
      type: "array",
      items: { $ref: "#/$defs/missingFact" },
    },
    ambiguities: {
      type: "array",
      items: { $ref: "#/$defs/ambiguity" },
    },
  },
  $defs: {
    evidenceAnchor: {
      type: "object",
      additionalProperties: false,
      required: ["page_number", "exact_quote"],
      properties: {
        page_number: { type: "integer", minimum: 1 },
        exact_quote: { type: "string", minLength: 1, maxLength: 16384 },
      },
    },
    observedFact: {
      type: "object",
      additionalProperties: false,
      required: ["status", "value", "evidence"],
      properties: {
        status: { const: "OBSERVED" },
        value: true,
        evidence: {
          type: "array",
          minItems: 1,
          items: { $ref: "#/$defs/evidenceAnchor" },
        },
      },
    },
    uncertainFact: {
      type: "object",
      additionalProperties: false,
      required: ["status", "value", "reason_code", "evidence"],
      properties: {
        status: { const: "UNCERTAIN" },
        value: true,
        reason_code: { type: "string", minLength: 1, maxLength: 128 },
        evidence: {
          type: "array",
          minItems: 1,
          items: { $ref: "#/$defs/evidenceAnchor" },
        },
      },
    },
    notFoundFact: {
      type: "object",
      additionalProperties: false,
      required: ["status"],
      properties: {
        status: { const: "NOT_FOUND" },
      },
    },
    notApplicableFact: {
      type: "object",
      additionalProperties: false,
      required: ["status"],
      properties: {
        status: { const: "NOT_APPLICABLE" },
      },
    },
    fact: {
      oneOf: [
        { $ref: "#/$defs/observedFact" },
        { $ref: "#/$defs/uncertainFact" },
        { $ref: "#/$defs/notFoundFact" },
        { $ref: "#/$defs/notApplicableFact" },
      ],
    },
    record: {
      type: "object",
      additionalProperties: false,
      required: ["record_type_id", "record_local_id", "segment_index", "facts", "children"],
      properties: {
        record_type_id: { type: "string", minLength: 1, maxLength: 128 },
        record_local_id: { type: "string", minLength: 1, maxLength: 128 },
        segment_index: { type: "integer", minimum: 0 },
        facts: {
          type: "object",
          additionalProperties: { $ref: "#/$defs/fact" },
        },
        children: {
          type: "array",
          items: { $ref: "#/$defs/record" },
        },
      },
    },
    classificationCandidate: {
      type: "object",
      additionalProperties: false,
      required: ["document_type_id", "rank", "evidence"],
      properties: {
        document_type_id: { type: "string", minLength: 1, maxLength: 128 },
        rank: { type: "integer", minimum: 1 },
        evidence: {
          type: "array",
          minItems: 1,
          items: { $ref: "#/$defs/evidenceAnchor" },
        },
      },
    },
    classificationSegment: {
      type: "object",
      additionalProperties: false,
      required: ["document_type_id", "page_start", "page_end"],
      properties: {
        document_type_id: { type: "string", minLength: 1, maxLength: 128 },
        page_start: { type: "integer", minimum: 1 },
        page_end: { type: "integer", minimum: 1 },
      },
    },
    missingFact: {
      type: "object",
      additionalProperties: false,
      required: ["fact_id", "status"],
      properties: {
        fact_id: { type: "string", minLength: 1, maxLength: 256 },
        status: { type: "string", enum: ["NOT_FOUND", "NOT_APPLICABLE"] },
      },
    },
    ambiguity: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "fact_ids", "reason_code", "evidence"],
      properties: {
        kind: { type: "string", minLength: 1, maxLength: 128 },
        fact_ids: {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 256 },
        },
        reason_code: { type: "string", minLength: 1, maxLength: 128 },
        evidence: {
          type: "array",
          minItems: 1,
          items: { $ref: "#/$defs/evidenceAnchor" },
        },
      },
    },
  },
} as const;
