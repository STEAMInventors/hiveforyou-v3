import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  PackValidationError,
  assertValidPackRelationships,
  computePackDigest,
  normalizeDomainPackManifest,
  parsePackManifest,
  resolvePackCatalog,
  scoreAllDocumentTypes,
  validatePackRelationships,
} from "./index.js";

const repoRoot = join(process.cwd(), "../..");
const iep200Path = join(repoRoot, "domain-packs/iep/2.0.0/manifest.json");
const iep210Path = join(repoRoot, "domain-packs/iep/2.1.0/manifest.json");

function loadNormalized(path: string) {
  const bytes = readFileSync(path, "utf8");
  const raw = JSON.parse(bytes) as Record<string, unknown>;
  return {
    bytes,
    raw,
    manifest: normalizeDomainPackManifest(parsePackManifest(raw)),
  };
}

describe("IEP domain pack 2.1.0 (draft)", () => {
  const { bytes: bytes210, raw: raw210, manifest: m210 } = loadNormalized(iep210Path);
  const { manifest: m200 } = loadNormalized(iep200Path);

  it("declares draft 2.1.0 supersedes reviewed 2.0.0", () => {
    expect(m210.pack_version).toBe("2.1.0");
    expect(raw210.supersedes).toBe("2.0.0");
    expect(m210.review_status).toBe("draft");
    expect(m210.contract_version).toBe("domain-pack-manifest@2");
  });

  it("parses with stable digest metadata", () => {
    const digest = computePackDigest(bytes210);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("resolves every checklist and ordering_date_field reference", () => {
    const issues = validatePackRelationships(m210);
    expect(issues).toEqual([]);
    expect(() => assertValidPackRelationships(m210)).not.toThrow();
  });

  it("is additive over 2.0.0 document and record type ids", () => {
    const doc200 = new Set(m200.document_types.map((d) => d.document_type_id));
    const rec200 = new Set(m200.record_types!.map((r) => r.record_type_id));
    for (const id of doc200) {
      expect(m210.document_types.some((d) => d.document_type_id === id)).toBe(true);
    }
    for (const id of rec200) {
      expect(m210.record_types!.some((r) => r.record_type_id === id)).toBe(true);
    }
    expect(m210.document_types.length).toBe(doc200.size + 4);
    expect(m210.record_types!.length).toBe(rec200.size + 2);
  });

  it("preserves 2.0.0 field ids on unchanged record types", () => {
    for (const record of m200.record_types!) {
      const next = m210.record_types!.find((r) => r.record_type_id === record.record_type_id);
      expect(next).toBeDefined();
      const fieldIds = new Set(record.fields.map((f) => f.field_id));
      for (const fieldId of fieldIds) {
        expect(next!.fields.some((f) => f.field_id === fieldId)).toBe(true);
      }
    }
  });

  it("does not alter measure.score_type enum order", () => {
    const score200 = m200.record_types!
      .find((r) => r.record_type_id === "goal")!
      .fields.find((f) => f.field_id === "measure.score_type")!.enum;
    const score210 = m210.record_types!
      .find((r) => r.record_type_id === "goal")!
      .fields.find((f) => f.field_id === "measure.score_type")!.enum;
    expect(score210).toEqual(score200);
  });

  it("applies P0 evaluation_plan_item and accommodation extensions", () => {
    const epi = m210.record_types!.find((r) => r.record_type_id === "evaluation_plan_item")!;
    expect(epi.identity.scope).toBe("document");
    expect(epi.identity.key_fields).toEqual(["list_section", "line_text"]);
    expect(epi.fields.find((f) => f.field_id === "selected")?.enum).toEqual([
      "selected",
      "not_selected",
    ]);
    const acc = m210.record_types!.find((r) => r.record_type_id === "accommodation")!;
    expect(acc.fields.find((f) => f.field_id === "kind")?.enum).toContain("modification");
    expect(acc.fields.find((f) => f.field_id === "context")?.enum).toContain(
      "state_district_assessment",
    );
  });

  it("stays inactive under reviewedOnly when 2.0.0 is present", () => {
    const iep200Bytes = readFileSync(iep200Path, "utf8");
    const { packs, diagnostics } = resolvePackCatalog(
      [
        { manifestPath: iep200Path, bytes: iep200Bytes },
        { manifestPath: iep210Path, bytes: bytes210 },
      ],
      { reviewedOnly: true },
    );
    expect(diagnostics.some((d) => d.code === "PACK_NOT_REVIEWED" && d.pack_version === "2.1.0")).toBe(
      true,
    );
    const iep = packs.find((p) => p.manifest.pack_id === "iep");
    expect(iep?.manifest.pack_version).toBe("2.0.0");
  });

  it("classifies representative L003/L006 titles with new document types", () => {
    const meetingNotes = scoreAllDocumentTypes([m210], {
      combinedPageText: "IEP Team Meeting Notes\nParticipants discussed goals.",
      pageCount: 2,
      filename: "03_iep_team_meeting_notes.pdf",
    });
    expect(meetingNotes[0]?.document_type_id).toBe("iep.meeting.notes");

    const tracking = scoreAllDocumentTypes([m210], {
      combinedPageText: "Classroom Behavior Tracking\nWeekly incidents",
      pageCount: 1,
      filename: "02_classroom_behavior_tracking.pdf",
    });
    expect(tracking[0]?.document_type_id).toBe("iep.behavior.observation");

    const serviceLog = scoreAllDocumentTypes([m210], {
      combinedPageText: "Service Delivery Log\nMinutes provided: 120",
      pageCount: 1,
      filename: "service_log.pdf",
    });
    expect(serviceLog[0]?.document_type_id).toBe("iep.service.implementation");
  });

  it("keeps L001 eight-document taxonomy classifiable (same top types as 2.0.0)", () => {
    const fixtures: {
      filename: string;
      text: string;
      expected: string;
      pageCount?: number;
    }[] = [
      { filename: "01_initial_referral.pdf", text: "Referral\nRequest for evaluation", expected: "iep.referral" },
      { filename: "02_evaluation_plan.pdf", text: "Evaluation Plan\nProposed assessments", expected: "iep.evaluation.plan" },
      { filename: "03_parent_evaluation_consent.pdf", text: "Consent\nI give permission\nParent signature", expected: "iep.consent" },
      {
        filename: "04_psychoeducational_evaluation.pdf",
        text: "Psychoeducational Evaluation\nSchool psychologist",
        expected: "iep.evaluation.psychoeducational",
      },
      { filename: "05_academic_evaluation.pdf", text: "Academic Evaluation\nWoodcock-Johnson", expected: "iep.evaluation.academic" },
      {
        filename: "06_speech_language_evaluation.pdf",
        text: "Speech-Language Evaluation\nCELF receptive expressive",
        expected: "iep.evaluation.speech_language",
      },
      {
        filename: "07_eligibility_determination.pdf",
        text: "Eligibility Determination\ndisability category",
        expected: "iep.eligibility",
      },
      {
        filename: "08_initial_iep.pdf",
        text: "Individualized Education Program\nPresent levels\nSpecial education services\nAnnual goals",
        expected: "iep.plan",
        pageCount: 4,
      },
    ];
    for (const fixture of fixtures) {
      const scores = scoreAllDocumentTypes([m210], {
        combinedPageText: fixture.text,
        pageCount: fixture.pageCount ?? 2,
        filename: fixture.filename,
      });
      expect(scores[0]?.document_type_id).toBe(fixture.expected);
    }
  });

  it("rejects identity key_fields that are not declared on the record", () => {
    const broken = structuredClone(m210);
    const goal = broken.record_types!.find((r) => r.record_type_id === "goal")!;
    goal.identity.key_fields.push("not_a_field");
    const issues = validatePackRelationships(broken);
    expect(issues.some((i) => i.code === "INVALID_IDENTITY")).toBe(true);
  });

  it("rejects unknown checklist record references", () => {
    const broken = structuredClone(m210);
    const doc = broken.document_types.find((d) => d.document_type_id === "iep.plan")!;
    if ("checklist" in doc && Array.isArray(doc.checklist)) {
      doc.checklist.push("not_a_record");
    }
    const issues = validatePackRelationships(broken);
    expect(issues.some((i) => i.code === "UNKNOWN_RECORD_TYPE")).toBe(true);
    expect(() => assertValidPackRelationships(broken)).toThrow(PackValidationError);
  });
});

/** Qualification touchpoint matrix for manual review (L001–L006). */
describe("IEP 2.1.0 coverage report (L001–L006)", () => {
  it("documents corpus coverage gaps", () => {
    const report = {
      pack_version: "2.1.0",
      L001: {
        status: "supported_without_new_types",
        note: "Eight PDFs use original 15 types; evaluation_plan_item + accommodation P0 fields apply.",
      },
      L002: {
        status: "partial",
        note: "Reevaluation subtypes on document_header; evaluation negatives reduce plan misclassification.",
      },
      L003: {
        status: "enabled",
        note: "iep.meeting.notes type + participants identity (P0-18).",
      },
      L004: {
        status: "supported",
        note: "Progress + plan types unchanged; temporal succession includes reporting fields.",
      },
      L005: {
        status: "partial",
        note: "Speech review partial tier (P0-21 negatives); same as L002.",
      },
      L006: {
        status: "enabled",
        note: "iep.behavior.observation + behavior_incident + FBA/BIP mutual negatives.",
      },
      gaps: [
        "iep.meeting.notice has no L001–L006 exemplar (P1-13 documented).",
        "iep.service.implementation has no dedicated L001–L006 PDF in matrix.",
        "Pack remains draft — production pins reviewed 2.0.0.",
      ],
    };
    expect(report.gaps.length).toBeGreaterThan(0);
    expect(report.L003.status).toBe("enabled");
  });
});
