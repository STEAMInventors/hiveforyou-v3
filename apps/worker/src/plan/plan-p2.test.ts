import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorCode } from "@hiveforyou/contracts/errors/v1";
import type { DomainPackManifestV1 } from "@hiveforyou/contracts/domain-packs/v1";
import type { DomainPackManifestV2 } from "@hiveforyou/contracts/domain-packs/v2";
import {
  computeSchemaHash,
  parsePackManifest,
  computePackDigest,
  normalizeDomainPackManifest,
} from "@hiveforyou/core";

import {
  AMBIGUITY_MULTIPLE_DOMAINS,
  AMBIGUITY_NO_STRONG_MATCH,
  classifyDocument,
} from "./classify.js";
import { PlanningError } from "./errors.js";
import { resolveDocumentClassification } from "./model-classify.js";
import { parseGeneratedFields } from "./model-schema.js";
import { planExtractionSchema, prepareExtractionPlan } from "./schema-plan.js";
import {
  assertPlannedSchema,
  normalizeModelGeneratedFieldKey,
} from "./schema-validate.js";
import { L001_CORPUS } from "./l001-corpus.fixture.js";
import type { ReasoningJsonClient, ReasoningJsonRequest } from "../reasoning/types.js";

const repoRoot = join(process.cwd(), "../..");
const iepManifestPath = join(repoRoot, "domain-packs/iep/1.0.0/manifest.json");
const iepV2ManifestPath = join(repoRoot, "domain-packs/iep/2.0.0/manifest.json");

function loadIepPack() {
  const bytes = readFileSync(iepManifestPath, "utf8");
  const manifest = parsePackManifest(JSON.parse(bytes));
  return { manifest, digest: computePackDigest(bytes) };
}

function loadIepV2Pack(): { manifest: DomainPackManifestV2; digest: string } {
  const bytes = readFileSync(iepV2ManifestPath, "utf8");
  const parsed = parsePackManifest(JSON.parse(bytes));
  const manifest = normalizeDomainPackManifest(parsed) as DomainPackManifestV2;
  return { manifest, digest: computePackDigest(bytes) };
}

function generatedField(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    value_type: "string",
    evidence_required: true,
    reusable: false,
    required_for_intent: false,
    ...overrides,
  };
}

function generatedFieldPayload(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const field = generatedField(overrides);
  delete field.evidence_required;
  return field;
}

function scriptedClient(
  handler: (request: ReasoningJsonRequest) => unknown,
): ReasoningJsonClient {
  return {
    async completeJson(request) {
      const parsed = handler(request);
      if (parsed instanceof Error) {
        throw parsed;
      }
      return { parsed, alias: "worker-p2-test", durationMs: 4 };
    },
  };
}

function refuseModel(): ReasoningJsonClient {
  return scriptedClient(() => {
    throw new Error("model should not be called");
  });
}

function unfamiliarClassification() {
  return {
    domain_id: null,
    document_type_id: null,
    pack_id: null,
    score: 0.1,
    classification_quality: "low" as const,
    ambiguity_notes: ["No loaded document type matches."],
    detected_sections: [{ label: "Totals", page_start: 1, page_end: 1 }],
  };
}

const billingManifest: DomainPackManifestV1 = {
  contract_version: "domain-pack-manifest@1",
  pack_id: "billing",
  pack_version: "1.0.0",
  review_status: "reviewed",
  domains: [{ domain_id: "billing", label: "Billing" }],
  document_types: [
    {
      document_type_id: "denial_letter",
      domain_id: "billing",
      label: "Denial letter",
      match: {
        title_patterns: ["denial letter"],
        keywords: ["medicaid denial", "claim denied"],
        section_headers: ["denial reason"],
      },
      structure: {
        fields: [
          {
            field_key: "denial_reason",
            title: "Denial reason",
            value_type: "string",
            evidence_required: true,
          },
        ],
      },
    },
  ],
};

describe("P2.2 schema planning", () => {
  const errorLogs: string[] = [];
  let errorSpy: { mockRestore: () => void } | undefined;

  afterEach(() => {
    errorSpy?.mockRestore();
    errorLogs.length = 0;
  });

  function captureErrors(): void {
    errorSpy = vi.spyOn(console, "error").mockImplementation((message: unknown) => {
      errorLogs.push(String(message));
    });
  }

  it("exact-match initial IEP structure", async () => {
    const pack = loadIepPack();
    const pages = [
      {
        page_number: 1,
        text: "Individualized Education Program\nAnnual Goal\nRelated Services",
      },
      { page_number: 2, text: "Present Levels of Performance\nAccommodations" },
    ];
    const { schema } = await prepareExtractionPlan({
      classificationInput: {
        source_document_id: "doc-1",
        filename: "annual-iep.pdf",
        pages,
        domain_hint: "iep",
        packs: [pack.manifest],
      },
      intent_text: "Prepare for my child's IEP meeting and annual goals",
      packs: [pack],
      reasoning: refuseModel(),
    });
    expect(schema.provenance.match_tier).toBe("exact");
    expect(schema.provenance.document_type_id).toBe("iep_initial");
    expect(schema.fields.some((field) => field.field_key === "annual_goals")).toBe(true);
    expect(schema.schema_hash).toBe(
      computeSchemaHash({
        intent_text: schema.intent_text,
        fields: schema.fields,
        provenance: schema.provenance,
        field_guidance: schema.field_guidance,
      }),
    );
  });

  it("validates schema hash for normalized IEP v2 iep.consent exact match", async () => {
    const pack = loadIepV2Pack();
    const consentDoc = L001_CORPUS.find((doc) => doc.expected_document_type_id === "iep.consent");
    expect(consentDoc).toBeDefined();
    const { schema } = await prepareExtractionPlan({
      classificationInput: {
        source_document_id: consentDoc!.source_document_id,
        filename: consentDoc!.filename,
        pages: consentDoc!.pages,
        domain_hint: "iep",
        packs: [pack.manifest],
      },
      intent_text: "Review document header student consent",
      packs: [pack],
      reasoning: refuseModel(),
    });
    expect(schema.provenance.match_tier).toBe("exact");
    expect(schema.provenance.document_type_id).toBe("iep.consent");
    expect(schema.field_guidance?.length).toBeGreaterThan(0);
    expect(schema.schema_hash).toBe(
      computeSchemaHash({
        intent_text: schema.intent_text,
        fields: schema.fields,
        provenance: schema.provenance,
        field_guidance: schema.field_guidance,
      }),
    );
    assertPlannedSchema(schema);

    const tamperedFields = {
      ...schema,
      fields: schema.fields.map((field, index) =>
        index === 0 ? { ...field, title: `${field.title} (edited)` } : field,
      ),
    };
    expect(() => assertPlannedSchema(tamperedFields)).toThrow(
      expect.objectContaining({
        errorCode: ErrorCode.MODEL_OUTPUT_INVALID,
        diagnostics: { reason: "schema_hash" },
      }),
    );

    const tamperedGuidance = {
      ...schema,
      field_guidance: schema.field_guidance?.map((entry, index) =>
        index === 0
          ? {
              ...entry,
              reading_note: entry.reading_note
                ? `${entry.reading_note} (edited)`
                : "(edited)",
            }
          : entry,
      ),
    };
    expect(() => assertPlannedSchema(tamperedGuidance)).toThrow(
      expect.objectContaining({
        errorCode: ErrorCode.MODEL_OUTPUT_INVALID,
        diagnostics: { reason: "schema_hash" },
      }),
    );
  });

  it("normalizes omitted evidence on IEP v2 iep.referral supplemental fields", async () => {
    const pack = loadIepV2Pack();
    const referralDoc = L001_CORPUS.find(
      (doc) => doc.expected_document_type_id === "iep.referral",
    );
    expect(referralDoc).toBeDefined();
    const { schema } = await prepareExtractionPlan({
      classificationInput: {
        source_document_id: referralDoc!.source_document_id,
        filename: referralDoc!.filename,
        pages: referralDoc!.pages,
        domain_hint: "iep",
        packs: [pack.manifest],
      },
      intent_text: "What is the reason for referral and evaluation request?",
      packs: [pack],
      reasoning: scriptedClient((request) => {
        expect(request.task).toBe("supplement_schema");
        return {
          fields: [
            generatedFieldPayload({
              field_key: "evaluation_request",
              title: "Evaluation request",
              required_for_intent: true,
            }),
          ],
        };
      }),
    });
    expect(schema.provenance.match_tier).toBe("exact");
    expect(schema.provenance.document_type_id).toBe("iep.referral");
    const supplemental = schema.fields.find((field) => field.field_key === "evaluation_request");
    expect(supplemental?.evidence_required).toBe(true);
    assertPlannedSchema(schema);
  });

  it("normalizes dotted supplemental field keys on IEP v2 iep.referral (L001 reproduction)", async () => {
    const pack = loadIepV2Pack();
    const referralDoc = L001_CORPUS.find(
      (doc) => doc.expected_document_type_id === "iep.referral",
    );
    expect(referralDoc).toBeDefined();
    const { schema } = await prepareExtractionPlan({
      classificationInput: {
        source_document_id: referralDoc!.source_document_id,
        filename: referralDoc!.filename,
        pages: referralDoc!.pages,
        domain_hint: "iep",
        packs: [pack.manifest],
      },
      intent_text: "What is the reason for referral and evaluation request?",
      packs: [pack],
      reasoning: scriptedClient((request) => {
        expect(request.task).toBe("supplement_schema");
        return {
          fields: [
            generatedFieldPayload({
              field_key: "evaluation.request",
              title: "Evaluation request",
              required_for_intent: true,
            }),
          ],
        };
      }),
    });
    expect(schema.provenance.match_tier).toBe("exact");
    expect(schema.provenance.document_type_id).toBe("iep.referral");
    const supplemental = schema.fields.find((field) => field.field_key === "evaluation_request");
    expect(supplemental?.evidence_required).toBe(true);
    assertPlannedSchema(schema);
  });

  it("exact-match IEP progress report structure", async () => {
    const pack = loadIepPack();
    const pages = [
      {
        page_number: 1,
        text:
          "IEP Progress Report\nProgress on Goals\nReporting period\n" +
          "Progress toward annual goals\nGoal status\nServices provided",
      },
    ];
    const { schema } = await prepareExtractionPlan({
      classificationInput: {
        source_document_id: "doc-2",
        filename: "progress-report.pdf",
        pages,
        domain_hint: null,
        packs: [pack.manifest],
      },
      intent_text: "Summarize progress on IEP goals this term",
      packs: [pack],
      reasoning: refuseModel(),
    });
    expect(schema.provenance.match_tier).toBe("exact");
    expect(schema.provenance.document_type_id).toBe("iep_progress_report");
  });

  it("supplements exact pack match when a single material intent term is uncovered", async () => {
    const pack = loadIepPack();
    const pages = [
      {
        page_number: 1,
        text: "Individualized Education Program\nAnnual Goal\nRelated Services",
      },
      { page_number: 2, text: "Present Levels of Performance\nAccommodations" },
    ];
    const classification = classifyDocument({
      source_document_id: "doc-homeschool",
      filename: "annual-iep.pdf",
      pages,
      domain_hint: "iep",
      packs: [pack.manifest],
    });
    expect(classification.chosen.document_type_id).toBe("iep_initial");
    const schema = await planExtractionSchema({
      intent_text: "Annual goals and homeschool",
      classification,
      combinedPageText: pages.map((page) => page.text).join("\n"),
      pages,
      packs: [pack],
      reasoning: scriptedClient((request) => {
        expect(request.task).toBe("supplement_schema");
        return {
          fields: [
            generatedField({
              field_key: "homeschool_coordination",
              title: "Homeschool coordination",
              required_for_intent: true,
            }),
          ],
        };
      }),
    });
    expect(schema.provenance.match_tier).toBe("exact");
    expect(schema.fields.some((field) => field.field_key === "homeschool_coordination")).toBe(true);
  });

  it("adds intent-specific fields on an exact pack match", async () => {
    const pack = loadIepPack();
    const pages = [
      {
        page_number: 1,
        text: "Individualized Education Program\nAnnual Goal\nRelated Services",
      },
      { page_number: 2, text: "Present Levels of Performance\nAccommodations" },
    ];
    const { schema } = await prepareExtractionPlan({
      classificationInput: {
        source_document_id: "doc-1b",
        filename: "annual-iep.pdf",
        pages,
        domain_hint: "iep",
        packs: [pack.manifest],
      },
      intent_text: "Record the assigned bus route and pickup window",
      packs: [pack],
      reasoning: scriptedClient((request) => {
        expect(request.task).toBe("supplement_schema");
        return {
          fields: [
            generatedField({
              field_key: "bus_route",
              title: "Bus route",
              required_for_intent: true,
            }),
            generatedField({
              field_key: "pickup_window",
              title: "Pickup window",
              required_for_intent: true,
            }),
          ],
        };
      }),
    });
    expect(schema.provenance.match_tier).toBe("exact");
    expect(schema.fields.some((field) => field.field_key === "annual_goals")).toBe(true);
    expect(schema.fields.some((field) => field.field_key === "student_name" && field.reusable)).toBe(
      true,
    );
    expect(
      schema.fields.find((field) => field.field_key === "bus_route")?.required_for_intent,
    ).toBe(true);
  });

  it("pack-free grocery receipt uses a generated schema", async () => {
    const pack = loadIepPack();
    const pages = [
      {
        page_number: 1,
        text: "Grocery Mart\nItem Qty Subtotal\nTax Total\nReceipt #123",
      },
    ];
    const seenTasks: string[] = [];
    const { classification, schema } = await prepareExtractionPlan({
      classificationInput: {
        source_document_id: "doc-3",
        filename: "receipt.jpg",
        pages,
        domain_hint: null,
        packs: [pack.manifest],
        correlation_id: "corr-receipt",
      },
      intent_text: "Track junk food purchases on this receipt",
      packs: [pack],
      correlation_id: "corr-receipt",
      reasoning: scriptedClient((request) => {
        seenTasks.push(request.task);
        if (request.task === "classify_document") {
          return unfamiliarClassification();
        }
        expect(JSON.stringify(request.userPayload.pages)).toContain("Grocery Mart");
        expect(request.userPayload.sections).toEqual([
          { label: "Totals", page_start: 1, page_end: 1 },
        ]);
        return {
          fields: [
            generatedField({
              field_key: "merchant_name",
              title: "Merchant name",
              reusable: true,
            }),
            generatedField({
              field_key: "junk_food_items",
              title: "Junk food items",
              value_type: "array",
              required_for_intent: true,
            }),
          ],
        };
      }),
    });
    expect(seenTasks).toEqual(["classify_document", "generate_schema"]);
    expect(classification.ambiguity_notes.length).toBeGreaterThan(0);
    expect(schema.provenance.match_tier).toBe("generic");
    expect(schema.generic).toBe(true);
    expect(schema.provenance.pack_digest).toBeNull();
    expect(schema.fields.some((field) => field.field_key === "merchant_name" && field.reusable)).toBe(
      true,
    );
    expect(
      schema.fields.some((field) => field.field_key === "junk_food_items" && field.required_for_intent),
    ).toBe(true);
    expect(schema.fields.some((field) => field.field_key === "document_title")).toBe(false);
  });

  it("generates different intent fields for the same unfamiliar document", async () => {
    const pack = loadIepPack();
    const pages = [
      {
        page_number: 1,
        text: "Harbor Lease\nTenant Ada Cole\nMonthly rent 1800\nPet addendum",
      },
    ];
    const intents = [
      "What is the monthly rent?",
      "Does this lease allow a pet?",
    ];
    const schemas = [];
    for (const intent_text of intents) {
      const { schema } = await prepareExtractionPlan({
        classificationInput: {
          source_document_id: "doc-lease",
          filename: "lease.pdf",
          pages,
          domain_hint: null,
          packs: [pack.manifest],
        },
        intent_text,
        packs: [pack],
        reasoning: scriptedClient((request) => {
          if (request.task === "classify_document") {
            return {
              ...unfamiliarClassification(),
              detected_sections: [{ label: "Parties", page_start: 1, page_end: 1 }],
            };
          }
          const intent = String(request.userPayload.intent_text);
          const intentField = intent.includes("rent")
            ? generatedField({
                field_key: "monthly_rent",
                title: "Monthly rent",
                value_type: "number",
                required_for_intent: true,
              })
            : generatedField({
                field_key: "pet_allowed",
                title: "Pet allowed",
                value_type: "boolean",
                required_for_intent: true,
              });
          return {
            fields: [
              generatedField({
                field_key: "tenant_name",
                title: "Tenant name",
                reusable: true,
              }),
              intentField,
            ],
          };
        }),
      });
      schemas.push(schema);
    }
    expect(schemas[0]?.provenance.pack_digest).toBeNull();
    expect(schemas[1]?.provenance.pack_digest).toBeNull();
    expect(schemas[0]?.fields.some((field) => field.field_key === "tenant_name")).toBe(true);
    expect(schemas[1]?.fields.some((field) => field.field_key === "tenant_name")).toBe(true);
    expect(schemas[0]?.fields.some((field) => field.field_key === "monthly_rent")).toBe(true);
    expect(schemas[1]?.fields.some((field) => field.field_key === "pet_allowed")).toBe(true);
    expect(schemas[0]?.schema_hash).not.toBe(schemas[1]?.schema_hash);
  });

  it("generates a partial-domain schema from the document and intent", async () => {
    const pack = loadIepPack();
    const pages = [
      {
        page_number: 1,
        text: "Individualized Education Program\nSpecial education\nAnnual goal",
      },
    ];
    let hintCount = 0;
    const { schema } = await prepareExtractionPlan({
      classificationInput: {
        source_document_id: "doc-partial",
        filename: "notes.pdf",
        pages,
        domain_hint: null,
        packs: [pack.manifest],
      },
      intent_text: "List evaluation concerns mentioned in this file",
      packs: [pack],
      reasoning: scriptedClient((request) => {
        if (request.task === "classify_document") {
          return {
            domain_id: "iep",
            document_type_id: null,
            pack_id: "iep",
            score: 0.4,
            classification_quality: "medium",
            ambiguity_notes: [],
            detected_sections: [{ label: "Goals", page_start: 1, page_end: 1 }],
          };
        }
        hintCount = Array.isArray(request.userPayload.hint_fields)
          ? request.userPayload.hint_fields.length
          : 0;
        expect(JSON.stringify(request.userPayload.pages)).toContain("Annual goal");
        expect(request.userPayload.intent_text).toContain("evaluation concerns");
        expect(request.userPayload.sections).toEqual([
          { label: "Goals", page_start: 1, page_end: 1 },
        ]);
        return {
          fields: [
            generatedField({
              field_key: "evaluation_concerns",
              title: "Evaluation concerns",
              value_type: "array",
              required_for_intent: true,
            }),
          ],
        };
      }),
    });
    expect(hintCount).toBeGreaterThan(0);
    expect(schema.provenance.match_tier).toBe("partial");
    expect(schema.provenance.pack_digest).toBe(pack.digest);
    expect(schema.generic).toBe(false);
    expect(schema.fields.some((field) => field.field_key === "student_name" && field.reusable)).toBe(
      true,
    );
    expect(schema.fields.some((field) => field.field_key === "school_district" && field.reusable)).toBe(
      true,
    );
    expect(schema.fields.some((field) => field.field_key === "evaluation_concerns")).toBe(true);
  });

  it("does not return a pack-only schema when intent field generation fails", async () => {
    captureErrors();
    const pack = loadIepPack();
    const pages = [
      {
        page_number: 1,
        text: "Individualized Education Program\nAnnual Goal\nRelated Services",
      },
      { page_number: 2, text: "Present Levels of Performance\nAccommodations" },
    ];
    await expect(
      prepareExtractionPlan({
        classificationInput: {
          source_document_id: "doc-supplement-fail",
          filename: "annual-iep.pdf",
          pages,
          domain_hint: "iep",
          packs: [pack.manifest],
          correlation_id: "corr-supplement-fail",
        },
        intent_text: "Record the assigned bus route and pickup window",
        packs: [pack],
        correlation_id: "corr-supplement-fail",
        reasoning: scriptedClient(
          () =>
            new PlanningError(ErrorCode.MODEL_TIMEOUT, "Reasoning model timed out.", {
              reason: "model_timeout",
              alias: "hive-p2-reasoning",
            }),
        ),
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.MODEL_TIMEOUT });
    const failure = errorLogs.join("\n");
    expect(failure).toContain("corr-supplement-fail");
    expect(failure).toContain("hive-p2-reasoning");
    expect(failure).not.toContain("Annual Goal");
  });

  it("accepts missing, null, or empty model ambiguity_notes", async () => {
    const pack = loadIepPack();
    const pages = [
      {
        page_number: 1,
        text: "Grocery Mart\nItem Qty Subtotal\nTax Total\nReceipt #123",
      },
    ];
    const inconclusiveInput = {
      source_document_id: "doc-ambiguity-empty",
      filename: "receipt.jpg",
      pages,
      domain_hint: null,
      packs: [pack.manifest],
      correlation_id: "corr-ambiguity-empty",
    };
    const classifyPayload = {
      domain_id: null,
      document_type_id: null,
      pack_id: null,
      score: 0.1,
      classification_quality: "low" as const,
      detected_sections: [{ label: "Totals", page_start: 1, page_end: 1 }],
    };

    for (const ambiguity_notes of [undefined, null, []] as const) {
      const resolved = await resolveDocumentClassification(
        inconclusiveInput,
        scriptedClient(() => ({
          ...classifyPayload,
          ambiguity_notes,
        })),
      );
      expect(resolved.ambiguity_notes).toContain(AMBIGUITY_NO_STRONG_MATCH);
    }
  });

  it("filters whitespace-only ambiguity notes and preserves trimmed valid notes", async () => {
    const pack = loadIepPack();
    const pages = [{ page_number: 1, text: "Unclassified workshop agenda" }];
    const resolved = await resolveDocumentClassification(
      {
        source_document_id: "doc-ambiguity-trim",
        filename: "agenda.txt",
        pages,
        domain_hint: null,
        packs: [pack.manifest],
      },
      scriptedClient(() => ({
        domain_id: null,
        document_type_id: null,
        pack_id: null,
        score: 0.2,
        classification_quality: "low" as const,
        ambiguity_notes: ["  ", "\t", "  Pack signals conflict.  "],
        detected_sections: [{ label: "Agenda", page_start: 1, page_end: 1 }],
      })),
    );
    expect(resolved.ambiguity_notes).toContain("Pack signals conflict.");
    expect(resolved.ambiguity_notes.some((note) => !note.trim())).toBe(false);
  });

  it("rejects scalar or non-string model ambiguity_notes", async () => {
    const pack = loadIepPack();
    const pages = [{ page_number: 1, text: "Unclassified workshop agenda" }];
    const inconclusiveInput = {
      source_document_id: "doc-ambiguity-bad",
      filename: "agenda.txt",
      pages,
      domain_hint: null,
      packs: [pack.manifest],
    };
    const classifyPayload = {
      domain_id: null,
      document_type_id: null,
      pack_id: null,
      score: 0.2,
      classification_quality: "low" as const,
      detected_sections: [{ label: "Agenda", page_start: 1, page_end: 1 }],
    };

    await expect(
      resolveDocumentClassification(
        inconclusiveInput,
        scriptedClient(() => ({
          ...classifyPayload,
          ambiguity_notes: "single note",
        })),
      ),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.MODEL_OUTPUT_INVALID,
      diagnostics: { reason: "ambiguity_notes" },
    });

    await expect(
      resolveDocumentClassification(
        inconclusiveInput,
        scriptedClient(() => ({
          ...classifyPayload,
          ambiguity_notes: ["valid note", 42],
        })),
      ),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.MODEL_OUTPUT_INVALID,
      diagnostics: { reason: "ambiguity_notes" },
    });
  });

  it("records ambiguity without forcing domain on mixed signals", async () => {
    const pack = loadIepPack();
    const pages = [
      {
        page_number: 1,
        text: "Medicaid denial letter and IEP progress report references",
      },
    ];
    const classification = classifyDocument({
      source_document_id: "doc-4",
      filename: "mixed.pdf",
      pages,
      domain_hint: null,
      packs: [pack.manifest, billingManifest],
    });
    expect(classification.ambiguity_notes).toContain(AMBIGUITY_MULTIPLE_DOMAINS);

    const resolved = await resolveDocumentClassification(
      {
        source_document_id: "doc-4",
        filename: "mixed.pdf",
        pages,
        domain_hint: null,
        packs: [pack.manifest, billingManifest],
        correlation_id: "corr-ambiguous",
      },
      scriptedClient(() => ({
        domain_id: "billing",
        document_type_id: "denial_letter",
        pack_id: "billing",
        score: 0.92,
        classification_quality: "high",
        ambiguity_notes: [],
        detected_sections: [{ label: "Denial", page_start: 1, page_end: 1 }],
      })),
    );
    expect(resolved.chosen.domain_id).toBeNull();
    expect(resolved.chosen.document_type_id).toBeNull();
    expect(resolved.ambiguity_notes).toContain(AMBIGUITY_MULTIPLE_DOMAINS);
    expect(resolved.detected_sections).toEqual([{ label: "Denial", page_start: 1, page_end: 1 }]);
  });

  it("ignores generated keys that collide with reusable pack fields", async () => {
    const pack = loadIepPack();
    const pages = [
      {
        page_number: 1,
        text: "Individualized Education Program\nSpecial education\nAnnual goal",
      },
    ];
    const { schema } = await prepareExtractionPlan({
      classificationInput: {
        source_document_id: "doc-dup-reusable",
        filename: "notes.pdf",
        pages,
        domain_hint: null,
        packs: [pack.manifest],
      },
      intent_text: "List evaluation concerns mentioned in this file",
      packs: [pack],
      reasoning: scriptedClient((request) => {
        if (request.task === "classify_document") {
          return {
            domain_id: "iep",
            document_type_id: null,
            pack_id: "iep",
            score: 0.4,
            classification_quality: "medium",
            ambiguity_notes: [],
            detected_sections: [{ label: "Goals", page_start: 1, page_end: 1 }],
          };
        }
        return {
          fields: [
            generatedField({
              field_key: "student_name",
              title: "Student name override",
              reusable: false,
              required_for_intent: true,
            }),
            generatedField({
              field_key: "evaluation_concerns",
              title: "Evaluation concerns",
              value_type: "array",
              required_for_intent: true,
            }),
          ],
        };
      }),
    });
    const studentFields = schema.fields.filter((field) => field.field_key === "student_name");
    expect(studentFields).toHaveLength(1);
    expect(studentFields[0]?.reusable).toBe(true);
    expect(studentFields[0]?.title).toBe("Student name");
    expect(schema.fields.some((field) => field.field_key === "evaluation_concerns")).toBe(true);
  });

  it("rejects duplicate field keys inside a generated schema payload", async () => {
    const pack = loadIepPack();
    const classification = classifyDocument({
      source_document_id: "doc-dup-keys",
      filename: "note.txt",
      pages: [{ page_number: 1, text: "Plain operational note without pack signals." }],
      domain_hint: null,
      packs: [pack.manifest],
    });
    await expect(
      planExtractionSchema({
        intent_text: "Summarize the operational note",
        classification,
        combinedPageText: "Plain operational note without pack signals.",
        pages: [{ page_number: 1, text: "Plain operational note without pack signals." }],
        packs: [pack],
        reasoning: scriptedClient(() => ({
          fields: [
            generatedField({
              field_key: "note_summary",
              title: "Note summary",
              required_for_intent: true,
            }),
            generatedField({
              field_key: "note_summary",
              title: "Duplicate summary",
              required_for_intent: true,
            }),
          ],
        })),
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.MODEL_OUTPUT_INVALID,
      diagnostics: { reason: "duplicate_field_key" },
    });
  });

  it("rejects a malformed generated schema without a template fallback", async () => {
    captureErrors();
    const pack = loadIepPack();
    const secret = "VERY_UNIQUE_PAGE_SECRET";
    const pages = [{ page_number: 1, text: `Utility bill\n${secret}` }];
    const plan = prepareExtractionPlan({
      classificationInput: {
        source_document_id: "doc-bad",
        filename: "bill.pdf",
        pages,
        domain_hint: null,
        packs: [pack.manifest],
        correlation_id: "corr-bad-schema",
      },
      intent_text: "What is the amount due?",
      packs: [pack],
      correlation_id: "corr-bad-schema",
      reasoning: scriptedClient((request) => {
        if (request.task === "classify_document") {
          return unfamiliarClassification();
        }
        return {
          fields: [
            generatedField({
              field_key: "amount_due",
              title: "Amount due",
              value_type: "money",
              required_for_intent: true,
            }),
          ],
        };
      }),
    });
    await expect(plan).rejects.toMatchObject({
      errorCode: ErrorCode.MODEL_OUTPUT_INVALID,
      diagnostics: { reason: "invalid_value_type" },
    });
    expect(errorLogs.join("\n")).not.toContain(secret);
    expect(errorLogs.join("\n")).toContain("corr-bad-schema");
    expect(errorLogs.join("\n")).toContain("MODEL_OUTPUT_INVALID");
  });

  it("rejects generated fields that do not require evidence", async () => {
    const pack = loadIepPack();
    const classification = classifyDocument({
      source_document_id: "doc-evidence",
      filename: "note.txt",
      pages: [{ page_number: 1, text: "Plain operational note without pack signals." }],
      domain_hint: null,
      packs: [pack.manifest],
    });
    await expect(
      planExtractionSchema({
        intent_text: "Summarize the operational note",
        classification,
        combinedPageText: "Plain operational note without pack signals.",
        pages: [{ page_number: 1, text: "Plain operational note without pack signals." }],
        packs: [pack],
        reasoning: scriptedClient(() => ({
          fields: [
            generatedField({
              field_key: "note_summary",
              title: "Note summary",
              evidence_required: false,
              reusable: true,
              required_for_intent: true,
            }),
          ],
        })),
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.MODEL_OUTPUT_INVALID,
      diagnostics: { reason: "evidence_required" },
    });
  });

  it("normalizes benign model field_key formatting before validation", () => {
    for (const [raw, expected] of [
      ["  Evaluation_Request  ", "evaluation_request"],
      ["Reason-For-Referral", "reason_for_referral"],
      ["referral.reason", "referral_reason"],
    ] as const) {
      const result = normalizeModelGeneratedFieldKey(raw);
      expect(result).toEqual({ ok: true, field_key: expected });
      const [parsed] = parseGeneratedFields({
        fields: [
          generatedFieldPayload({
            field_key: raw,
            title: "Test field",
            required_for_intent: true,
          }),
        ],
      });
      expect(parsed?.field_key).toBe(expected);
    }
  });

  it("rejects invalid model field keys with safe field_key_category diagnostics", () => {
    for (const [raw, category] of [
      ["", "empty"],
      ["   ", "empty"],
      ["123bad", "invalid_prefix"],
      ["bad key", "invalid_character"],
      ["bad@key", "invalid_character"],
      [`a${"b".repeat(64)}`, "too_long"],
    ] as const) {
      expect(normalizeModelGeneratedFieldKey(raw)).toEqual({ ok: false, category });
      expect(() =>
        parseGeneratedFields({
          fields: [
            generatedFieldPayload({
              field_key: raw,
              title: "Bad field",
              required_for_intent: true,
            }),
          ],
        }),
      ).toThrow(
        expect.objectContaining({
          errorCode: ErrorCode.MODEL_OUTPUT_INVALID,
          diagnostics: { reason: "invalid_field_key", field_key_category: category },
        }),
      );
    }
  });

  it("logs field_key_category on plan_schema failure for invalid supplemental keys (L001)", async () => {
    captureErrors();
    const pack = loadIepV2Pack();
    const referralDoc = L001_CORPUS.find(
      (doc) => doc.expected_document_type_id === "iep.referral",
    );
    expect(referralDoc).toBeDefined();
    const rawFieldKey = "bad key";
    await expect(
      prepareExtractionPlan({
        classificationInput: {
          source_document_id: referralDoc!.source_document_id,
          filename: referralDoc!.filename,
          pages: referralDoc!.pages,
          domain_hint: "iep",
          packs: [pack.manifest],
          correlation_id: "corr-invalid-field-key",
        },
        intent_text: "What is the reason for referral and evaluation request?",
        packs: [pack],
        correlation_id: "corr-invalid-field-key",
        reasoning: scriptedClient((request) => {
          expect(request.task).toBe("supplement_schema");
          return {
            fields: [
              generatedFieldPayload({
                field_key: rawFieldKey,
                title: "Bad supplemental field",
                required_for_intent: true,
              }),
            ],
          };
        }),
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.MODEL_OUTPUT_INVALID,
      diagnostics: { reason: "invalid_field_key", field_key_category: "invalid_character" },
    });
    expect(errorLogs).toHaveLength(1);
    const logged = JSON.parse(errorLogs[0]!) as {
      stage: string;
      failure_reason: string;
      field_key_category?: string;
    };
    expect(logged.stage).toBe("plan_schema");
    expect(logged.failure_reason).toBe("invalid_field_key");
    expect(logged.field_key_category).toBe("invalid_character");
    expect(errorLogs.join("\n")).not.toContain(rawFieldKey);
  });

  it("rejects model field keys that collide after normalization", () => {
    expect(() =>
      parseGeneratedFields({
        fields: [
          generatedFieldPayload({
            field_key: "evaluation.request",
            title: "First",
            required_for_intent: true,
          }),
          generatedFieldPayload({
            field_key: "evaluation_request",
            title: "Second",
            required_for_intent: true,
          }),
        ],
      }),
    ).toThrow(
      expect.objectContaining({
        errorCode: ErrorCode.MODEL_OUTPUT_INVALID,
        diagnostics: { reason: "duplicate_field_key" },
      }),
    );
  });

  it("normalizes omitted, null, and true evidence_required on generated fields", () => {
    for (const field of [
      generatedFieldPayload({
        field_key: "omitted_flag",
        title: "Omitted flag",
        required_for_intent: true,
      }),
      generatedField({
        field_key: "null_flag",
        title: "Null flag",
        evidence_required: null,
        required_for_intent: true,
      }),
      generatedField({
        field_key: "true_flag",
        title: "True flag",
        evidence_required: true,
        required_for_intent: true,
      }),
    ]) {
      const [parsed] = parseGeneratedFields({ fields: [field] });
      expect(parsed?.evidence_required).toBe(true);
    }
  });

  it("rejects false and malformed evidence_required on generated fields", () => {
    for (const field of [
      generatedField({
        field_key: "false_flag",
        title: "False flag",
        evidence_required: false,
        required_for_intent: true,
      }),
      generatedField({
        field_key: "string_flag",
        title: "String flag",
        evidence_required: "true",
        required_for_intent: true,
      }),
      generatedField({
        field_key: "number_flag",
        title: "Number flag",
        evidence_required: 1,
        required_for_intent: true,
      }),
    ]) {
      expect(() => parseGeneratedFields({ fields: [field] })).toThrow(
        expect.objectContaining({
          errorCode: ErrorCode.MODEL_OUTPUT_INVALID,
          diagnostics: { reason: "evidence_required" },
        }),
      );
    }
  });

  it("fails closed when the reasoning gateway is unavailable", async () => {
    captureErrors();
    const pack = loadIepPack();
    const previous = {
      base: process.env.LITELLM_BASE_URL,
      key: process.env.LITELLM_API_KEY,
      alias: process.env.WORKER_P2_REASONING_LITELLM_ALIAS,
    };
    delete process.env.LITELLM_BASE_URL;
    delete process.env.LITELLM_API_KEY;
    delete process.env.WORKER_P2_REASONING_LITELLM_ALIAS;
    try {
      await expect(
        prepareExtractionPlan({
          classificationInput: {
            source_document_id: "doc-down",
            filename: "receipt.jpg",
            pages: [{ page_number: 1, text: "Corner market total 12.40" }],
            domain_hint: null,
            packs: [pack.manifest],
          },
          intent_text: "Track junk food purchases on this receipt",
          packs: [pack],
        }),
      ).rejects.toMatchObject({ errorCode: ErrorCode.DEPENDENCY_UNAVAILABLE });
    } finally {
      restoreEnv("LITELLM_BASE_URL", previous.base);
      restoreEnv("LITELLM_API_KEY", previous.key);
      restoreEnv("WORKER_P2_REASONING_LITELLM_ALIAS", previous.alias);
    }
  });

  it("does not fall back to a template when schema generation fails", async () => {
    const pack = loadIepPack();
    const pages = [
      {
        page_number: 1,
        text: "Individualized Education Program\nSpecial education\nAnnual goal",
      },
    ];
    await expect(
      prepareExtractionPlan({
        classificationInput: {
          source_document_id: "doc-partial-fail",
          filename: "notes.pdf",
          pages,
          domain_hint: null,
          packs: [pack.manifest],
        },
        intent_text: "List evaluation concerns mentioned in this file",
        packs: [pack],
        reasoning: scriptedClient((request) => {
          if (request.task === "classify_document") {
            return {
              domain_id: "iep",
              document_type_id: null,
              pack_id: "iep",
              score: 0.4,
              classification_quality: "medium",
              ambiguity_notes: [],
              detected_sections: [],
            };
          }
          return new PlanningError(ErrorCode.MODEL_UNAVAILABLE, "Reasoning gateway returned an error.", {
            reason: "gateway_status",
          });
        }),
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.MODEL_UNAVAILABLE });
  });

  it("rejects an oversized generated field list", async () => {
    const pack = loadIepPack();
    const classification = classifyDocument({
      source_document_id: "doc-size",
      filename: "unknown.txt",
      pages: [{ page_number: 1, text: "Unclassified workshop agenda" }],
      domain_hint: null,
      packs: [pack.manifest],
    });
    const fields = Array.from({ length: 41 }, (_, index) =>
      generatedField({
        field_key: `field_${index}`,
        title: `Field ${index}`,
        reusable: index === 0,
        required_for_intent: index === 1,
      }),
    );
    await expect(
      planExtractionSchema({
        intent_text: "Capture the agenda items",
        classification,
        combinedPageText: "Unclassified workshop agenda",
        pages: [{ page_number: 1, text: "Unclassified workshop agenda" }],
        packs: [pack],
        reasoning: scriptedClient(() => ({ fields })),
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.MODEL_OUTPUT_INVALID,
      diagnostics: { reason: "too_many_fields" },
    });
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
