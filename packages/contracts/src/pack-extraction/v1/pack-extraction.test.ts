import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  DOCUMENT_CLASSIFICATION_VERSION,
  type DocumentClassificationV1,
} from "../../extraction/v1/types.js";
import {
  PACK_EXTRACTION_INPUT_VERSION,
  PACK_EXTRACTION_OUTPUT_JSON_SCHEMA,
  PACK_EXTRACTION_OUTPUT_VERSION,
  PACK_EXTRACTION_REF_VERSION,
  PACK_EXTRACTION_VALIDATION_VERSION,
  parsePackExtractionInputV1,
  parsePackExtractionOutputV1,
  parsePackExtractionRefV1,
  parsePackExtractionValidationV1,
} from "./index.js";

const DIGEST = `sha256:${"a".repeat(64)}`;
const PACK_DIGEST = "b".repeat(64);
const SOURCE_SHA = "c".repeat(64);

function buildValidInput() {
  return {
    contract_version: PACK_EXTRACTION_INPUT_VERSION,
    prompt_digest: DIGEST,
    source_ref: {
      source_ref_id: "src-1",
      source_sha256: SOURCE_SHA,
      read_fingerprint: "read-fp-1",
    },
    source_metadata: {
      mime_family: "pdf",
      page_count: 2,
      window: { page_start: 1, page_end: 2, is_partial: false },
      pages: [
        { page_number: 1, extraction_method: "native_text", quality: "good" },
        { page_number: 2, extraction_method: "native_text", quality: "good" },
      ],
    },
    pages: [
      { page_number: 1, text: "<<<PAGE 1 BEGIN>>>\nLine one\n<<<PAGE 1 END>>>" },
      { page_number: 2, text: "<<<PAGE 2 BEGIN>>>\nLine two\n<<<PAGE 2 END>>>" },
    ],
  };
}

function buildValidOutput(overrides: Record<string, unknown> = {}) {
  return {
    contract_version: PACK_EXTRACTION_OUTPUT_VERSION,
    prompt_digest: DIGEST,
    source_ref_id: "src-1",
    classification: {
      status: "CLASSIFIED",
      primary_document_type_id: "iep.plan",
      candidates: [
        {
          document_type_id: "iep.plan",
          rank: 1,
          evidence: [{ page_number: 1, exact_quote: "Line one" }],
        },
      ],
    },
    records: [
      {
        record_type_id: "document_header",
        record_local_id: "r1",
        segment_index: 0,
        facts: {
          "document_header.document_date": {
            status: "OBSERVED",
            value: "2025-03-14",
            evidence: [{ page_number: 1, exact_quote: "Line one" }],
          },
          "document_header.effective_end": { status: "NOT_FOUND" },
        },
        children: [],
      },
    ],
    missing_facts: [{ fact_id: "document_header.refers_to_plan_date", status: "NOT_APPLICABLE" }],
    ...overrides,
  };
}

describe("pack-extraction-input@1", () => {
  it("accepts a valid windowed payload", () => {
    const parsed = parsePackExtractionInputV1(buildValidInput());
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.prompt_digest).toBe(DIGEST.toLowerCase());
      expect(parsed.value.pages).toHaveLength(2);
    }
  });

  it("rejects forbidden intent and identity keys", () => {
    const withIntent = { ...buildValidInput(), intent_text: "What is the IEP?" };
    expect(parsePackExtractionInputV1(withIntent).ok).toBe(false);

    const withIdentity = {
      ...buildValidInput(),
      source_ref: {
        ...buildValidInput().source_ref,
        source_document_id: "11111111-1111-4111-8111-111111111111",
      },
    };
    const identityResult = parsePackExtractionInputV1(withIdentity);
    expect(identityResult.ok).toBe(false);
    if (!identityResult.ok) {
      expect(identityResult.field).toContain("source_document_id");
    }
  });

  it("rejects invalid digests", () => {
    const badPrompt = { ...buildValidInput(), prompt_digest: "not-a-digest" };
    expect(parsePackExtractionInputV1(badPrompt).ok).toBe(false);

    const badSource = {
      ...buildValidInput(),
      source_ref: { ...buildValidInput().source_ref, source_sha256: "short" },
    };
    expect(parsePackExtractionInputV1(badSource).ok).toBe(false);
  });

  it("enforces page window boundaries", () => {
    const partial = buildValidInput();
    partial.source_metadata.window = { page_start: 2, page_end: 2, is_partial: true };
    partial.pages = [{ page_number: 1, text: "orphan page" }];
    expect(parsePackExtractionInputV1(partial).ok).toBe(false);
  });
});

describe("pack-extraction-output@1", () => {
  it("accepts CLASSIFIED, AMBIGUOUS and UNRECOGNIZED classifications", () => {
    expect(parsePackExtractionOutputV1(buildValidOutput()).ok).toBe(true);

    const ambiguous = buildValidOutput({
      classification: {
        status: "AMBIGUOUS",
        candidates: [
          {
            document_type_id: "iep.plan",
            rank: 1,
            evidence: [{ page_number: 1, exact_quote: "Line one" }],
          },
          {
            document_type_id: "iep.referral",
            rank: 2,
            evidence: [{ page_number: 1, exact_quote: "Line one" }],
          },
        ],
      },
    });
    expect(parsePackExtractionOutputV1(ambiguous).ok).toBe(true);

    const unrecognized = buildValidOutput({
      classification: { status: "UNRECOGNIZED" },
      records: [],
    });
    expect(parsePackExtractionOutputV1(unrecognized).ok).toBe(true);
  });

  it("enforces fact status and evidence rules", () => {
    const missingEvidence = buildValidOutput();
    (missingEvidence.records[0] as Record<string, unknown>).facts = {
      "document_header.document_date": { status: "OBSERVED", value: "2025-03-14", evidence: [] },
    };
    expect(parsePackExtractionOutputV1(missingEvidence).ok).toBe(false);

    const valueOnNotFound = buildValidOutput();
    (valueOnNotFound.records[0] as Record<string, unknown>).facts = {
      "document_header.document_date": { status: "NOT_FOUND", value: "x" },
    };
    expect(parsePackExtractionOutputV1(valueOnNotFound).ok).toBe(false);

    const uncertain = buildValidOutput();
    (uncertain.records[0] as Record<string, unknown>).facts = {
      "document_header.document_date": {
        status: "UNCERTAIN",
        value: "2025-03-14",
        reason_code: "illegible",
        evidence: [{ page_number: 1, exact_quote: "Line one" }],
      },
    };
    expect(parsePackExtractionOutputV1(uncertain).ok).toBe(true);
  });

  it("rejects evidence outside the request window when options.window is supplied", () => {
    const payload = buildValidOutput();
    const result = parsePackExtractionOutputV1(payload, {
      expected_prompt_digest: DIGEST,
      expected_source_ref_id: "src-1",
      window: { page_start: 2, page_end: 2 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toContain("page_number");
    }
  });

  it("rejects prompt_digest and source_ref_id mismatches against the request", () => {
    const payload = buildValidOutput({ prompt_digest: `sha256:${"d".repeat(64)}` });
    const result = parsePackExtractionOutputV1(payload, {
      expected_prompt_digest: DIGEST,
      expected_source_ref_id: "src-1",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects overlapping COMPOUND segments", () => {
    const compound = buildValidOutput({
      classification: {
        status: "COMPOUND",
        candidates: [
          {
            document_type_id: "iep.plan",
            rank: 1,
            evidence: [{ page_number: 1, exact_quote: "Line one" }],
          },
        ],
        segments: [
          { document_type_id: "iep.plan", page_start: 1, page_end: 2 },
          { document_type_id: "iep.referral", page_start: 2, page_end: 3 },
        ],
      },
    });
    expect(parsePackExtractionOutputV1(compound).ok).toBe(false);
  });
});

describe("pack-extraction-validation@1", () => {
  it("accepts known rejection reason codes", () => {
    const parsed = parsePackExtractionValidationV1({
      contract_version: PACK_EXTRACTION_VALIDATION_VERSION,
      disposition: "VALID_WITH_REJECTIONS",
      counts: { records: 1, facts_accepted: 1, facts_rejected: 1, records_rejected: 0 },
      rejections: [{ path: "/records/0/facts/x", reason_code: "MISSING_EVIDENCE" }],
      validator_version: "pack-extraction-validator@1",
    });
    expect(parsed.ok).toBe(true);
  });

  it("rejects unknown validation reason codes", () => {
    const parsed = parsePackExtractionValidationV1({
      contract_version: PACK_EXTRACTION_VALIDATION_VERSION,
      disposition: "VALID_WITH_REJECTIONS",
      counts: { records: 1, facts_accepted: 1, facts_rejected: 1, records_rejected: 0 },
      rejections: [{ path: "/records/0/facts/x", reason_code: "NOT_A_REAL_CODE" }],
      validator_version: "pack-extraction-validator@1",
    });
    expect(parsed.ok).toBe(false);
  });
});

describe("pack-extraction-ref@1", () => {
  it("accepts digest-only reference payloads", () => {
    const parsed = parsePackExtractionRefV1({
      contract_version: PACK_EXTRACTION_REF_VERSION,
      pack_id: "iep",
      pack_version: "2.0.0",
      pack_digest: PACK_DIGEST,
      pack_canonical_digest: DIGEST,
      catalog_digest: DIGEST,
      output_schema_digest: DIGEST,
      prompt_template_version: "pack-extraction-system@1",
      extraction_rules_version: "hive-extraction-rules@1",
      output_contract_version: PACK_EXTRACTION_OUTPUT_VERSION,
      prompt_digests: [DIGEST],
      partition_plan_digest: null,
    });
    expect(parsed.ok).toBe(true);
  });

  it("rejects prompt and document content fields", () => {
    const parsed = parsePackExtractionRefV1({
      contract_version: PACK_EXTRACTION_REF_VERSION,
      pack_id: "iep",
      pack_version: "2.0.0",
      pack_digest: PACK_DIGEST,
      prompt_template_version: "pack-extraction-system@1",
      extraction_rules_version: "hive-extraction-rules@1",
      output_contract_version: PACK_EXTRACTION_OUTPUT_VERSION,
      prompt_digests: [DIGEST],
      system_text: "compiled prompt bytes",
    });
    expect(parsed.ok).toBe(false);
  });
});

describe("output JSON Schema artifact", () => {
  it("matches the checked-in schema file", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const schemaPath = join(here, "../../../schemas/pack-extraction-output.v1.json");
    const onDisk = JSON.parse(readFileSync(schemaPath, "utf8"));
    expect(PACK_EXTRACTION_OUTPUT_JSON_SCHEMA).toEqual(onDisk);
  });
});

describe("extraction/v1 compatibility", () => {
  it("preserves existing document-classification@1 typing", () => {
    const sample: DocumentClassificationV1 = {
      contract_version: DOCUMENT_CLASSIFICATION_VERSION,
      source_document_id: "11111111-1111-4111-8111-111111111111",
      chosen: {
        domain_id: "iep",
        document_type_id: "iep.plan",
        pack_id: "iep",
        score: 1,
      },
      candidates: [],
      ambiguity_notes: [],
      classification_quality: "high",
      detected_sections: [],
    };
    expect(sample.contract_version).toBe("document-classification@1");
  });
});
