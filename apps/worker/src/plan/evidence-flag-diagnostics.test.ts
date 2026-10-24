import { describe, expect, it, vi, afterEach } from "vitest";

import { EXTRACTION_SCHEMA_VERSION, type ExtractionSchemaV1 } from "@hiveforyou/contracts/extraction/v1";
import { ErrorCode } from "@hiveforyou/contracts/errors/v1";
import { computeSchemaHash } from "@hiveforyou/core";

import { classifyDocument } from "./classify.js";
import { parseGeneratedFields } from "./model-schema.js";
import { planExtractionSchema } from "./schema-plan.js";
import {
  assertPlannedSchema,
  classifyInvalidEvidenceFlagKind,
} from "./schema-validate.js";
import type { ReasoningJsonClient } from "../reasoning/types.js";

function generatedField(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    value_type: "string",
    reusable: false,
    required_for_intent: true,
    ...overrides,
  };
}

function plannedSchema(evidenceRequired: unknown): ExtractionSchemaV1 {
  const field = {
    field_key: "sample_field",
    title: "Sample field",
    value_type: "string" as const,
    reusable: true,
    required_for_intent: true,
    ...(evidenceRequired === Symbol.for("omit")
      ? {}
      : { evidence_required: evidenceRequired as boolean | undefined }),
  };
  const provenance = {
    match_tier: "exact" as const,
    pack_id: "iep",
    pack_version: "2.0.0",
    pack_digest: "digest",
    document_type_id: "iep.consent",
    domain_id: "iep",
  };
  const intent_text = "Review consent";
  const fields = [field];
  return {
    contract_version: EXTRACTION_SCHEMA_VERSION,
    extraction_schema_id: "schema-id",
    intent_text,
    fields,
    provenance,
    generic: false,
    schema_hash: computeSchemaHash({
      intent_text,
      fields,
      provenance,
      field_guidance: undefined,
    }),
  };
}

describe("evidence flag diagnostics", () => {
  describe("classifyInvalidEvidenceFlagKind", () => {
    it.each([
      [false, "model_field_parse", "explicit_false"],
      [false, "planned_schema", "explicit_false"],
      ["true", "model_field_parse", "string_true"],
      ["TRUE", "model_field_parse", "string_true"],
      ["false", "model_field_parse", "string_false"],
      [1, "model_field_parse", "number"],
      [{ bad: true }, "model_field_parse", "other_invalid"],
      [undefined, "planned_schema", "missing_on_planned_field"],
      [null, "planned_schema", "missing_on_planned_field"],
    ] as const)(
      "classifies %j on %s as %s",
      (value, boundary, kind) => {
        expect(classifyInvalidEvidenceFlagKind(value, boundary)).toBe(kind);
      },
    );
  });

  describe("model_field_parse boundary", () => {
    it.each([
      ["explicit_false", { evidence_required: false }],
      ["string_true", { evidence_required: "true" }],
      ["string_false", { evidence_required: "false" }],
      ["number", { evidence_required: 1 }],
      ["other_invalid", { evidence_required: { invalid: true } }],
    ] as const)("reports %s via parseGeneratedFields", (kind, flag) => {
      expect(() =>
        parseGeneratedFields({
          fields: [
            generatedField({
              field_key: "flag_test",
              title: "Flag test",
              ...flag,
            }),
          ],
        }),
      ).toThrow(
        expect.objectContaining({
          errorCode: ErrorCode.MODEL_OUTPUT_INVALID,
          diagnostics: {
            reason: "evidence_required",
            validation_boundary: "model_field_parse",
            evidence_flag_kind: kind,
          },
        }),
      );
    });
  });

  describe("planned_schema boundary", () => {
    it.each([
      ["explicit_false", false],
      ["missing_on_planned_field", Symbol.for("omit")],
    ] as const)("reports %s via assertPlannedSchema", (kind, evidenceValue) => {
      const schema = plannedSchema(evidenceValue);
      expect(() => assertPlannedSchema(schema)).toThrow(
        expect.objectContaining({
          errorCode: ErrorCode.MODEL_OUTPUT_INVALID,
          diagnostics: {
            reason: "evidence_required",
            validation_boundary: "planned_schema",
            evidence_flag_kind: kind,
          },
        }),
      );
    });

    it("reports string_true on planned fields", () => {
      const schema = plannedSchema("true");
      expect(() => assertPlannedSchema(schema)).toThrow(
        expect.objectContaining({
          errorCode: ErrorCode.MODEL_OUTPUT_INVALID,
          diagnostics: {
            reason: "evidence_required",
            validation_boundary: "planned_schema",
            evidence_flag_kind: "string_true",
          },
        }),
      );
    });
  });

  describe("plan_schema structured log", () => {
    const errorLogs: string[] = [];
    let errorSpy: { mockRestore: () => void } | undefined;

    afterEach(() => {
      errorSpy?.mockRestore();
      errorLogs.length = 0;
    });

    it("includes validation_boundary and evidence_flag_kind on failure", async () => {
      errorSpy = vi.spyOn(console, "error").mockImplementation((message: unknown) => {
        errorLogs.push(String(message));
      });
      const classification = classifyDocument({
        source_document_id: "doc-log-evidence",
        filename: "note.txt",
        pages: [{ page_number: 1, text: "Plain operational note without pack signals." }],
        domain_hint: null,
        packs: [],
      });
      const reasoning: ReasoningJsonClient = {
        async completeJson() {
          return {
            parsed: {
              fields: [
                generatedField({
                  field_key: "note_summary",
                  title: "Note summary",
                  evidence_required: false,
                  reusable: true,
                }),
              ],
            },
            alias: "worker-p2-test",
            durationMs: 2,
          };
        },
      };
      await expect(
        planExtractionSchema({
          intent_text: "Summarize the operational note",
          classification,
          combinedPageText: "Plain operational note without pack signals.",
          pages: [{ page_number: 1, text: "Plain operational note without pack signals." }],
          packs: [],
          correlation_id: "corr-evidence-log",
          reasoning,
        }),
      ).rejects.toMatchObject({
        diagnostics: {
          validation_boundary: "model_field_parse",
          evidence_flag_kind: "explicit_false",
        },
      });
      expect(errorLogs).toHaveLength(1);
      const logged = JSON.parse(errorLogs[0]!) as {
        stage: string;
        failure_reason: string;
        validation_boundary?: string;
        evidence_flag_kind?: string;
      };
      expect(logged.stage).toBe("plan_schema");
      expect(logged.failure_reason).toBe("evidence_required");
      expect(logged.validation_boundary).toBe("model_field_parse");
      expect(logged.evidence_flag_kind).toBe("explicit_false");
    });
  });
});
