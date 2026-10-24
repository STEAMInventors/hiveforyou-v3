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
      { evidence_required: false },
      { evidence_required: "true" },
      { evidence_required: "false" },
      { evidence_required: 1 },
      { evidence_required: { invalid: true } },
    ] as const)("ignores legacy flag %j and sets evidence_required true", (flag) => {
      const { fields, ignoredLegacyEvidenceFlagCount } = parseGeneratedFields({
        fields: [
          generatedField({
            field_key: "flag_test",
            title: "Flag test",
            ...flag,
          }),
        ],
      });
      expect(fields[0]?.evidence_required).toBe(true);
      expect(ignoredLegacyEvidenceFlagCount).toBe(1);
    });

    it("does not count omitted evidence_required as legacy", () => {
      const { fields, ignoredLegacyEvidenceFlagCount } = parseGeneratedFields({
        fields: [
          generatedField({
            field_key: "flag_test",
            title: "Flag test",
          }),
        ],
      });
      expect(fields[0]?.evidence_required).toBe(true);
      expect(ignoredLegacyEvidenceFlagCount).toBe(0);
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
    const infoLogs: string[] = [];
    let infoSpy: { mockRestore: () => void } | undefined;

    afterEach(() => {
      infoSpy?.mockRestore();
      infoLogs.length = 0;
    });

    it("logs ignored_legacy_evidence_flag_count on successful plan when model sent false", async () => {
      infoSpy = vi.spyOn(console, "info").mockImplementation((message: unknown) => {
        infoLogs.push(String(message));
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
                  required_for_intent: true,
                }),
              ],
            },
            alias: "worker-p2-test",
            durationMs: 2,
          };
        },
      };
      await planExtractionSchema({
        intent_text: "Summarize the operational note",
        classification,
        combinedPageText: "Plain operational note without pack signals.",
        pages: [{ page_number: 1, text: "Plain operational note without pack signals." }],
        packs: [],
        correlation_id: "corr-evidence-log",
        reasoning,
      });
      const planLog = infoLogs
        .map((line) => JSON.parse(line) as { stage?: string; ignored_legacy_evidence_flag_count?: number })
        .find((entry) => entry.stage === "plan_schema");
      expect(planLog?.ignored_legacy_evidence_flag_count).toBe(1);
    });
  });
});
