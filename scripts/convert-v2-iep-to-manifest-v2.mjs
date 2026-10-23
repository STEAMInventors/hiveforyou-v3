#!/usr/bin/env node
/**
 * One-way converter: V2 iep-pack.v0.3.proposed.json -> domain-pack-manifest@2
 * Does not execute pack callbacks or mutate runtime services.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const v2Path =
  process.env.V2_IEP_PACK_PATH ??
  join(
    process.env.USERPROFILE ?? "",
    "hiveforyou-v2",
    "brain",
    "domain-packs",
    "iep",
    "iep-pack.v0.3.proposed.json",
  );

const raw = JSON.parse(readFileSync(v2Path, "utf8"));

function mapRecordType(record) {
  return {
    record_type_id: record.id,
    label: record.label,
    group: record.group,
    repeatable: record.repeatable,
    identity: {
      scope: record.identity.scope,
      key_fields: record.identity.keyFields ?? [],
      key_fields_if_present: record.identity.keyFieldsIfPresent ?? [],
      disambiguators: record.identity.disambiguators ?? [],
      version_axis: record.identity.versionAxis,
      case_singleton_merge: record.identity.caseSingletonMerge,
      cross_document_merge: record.identity.crossDocumentMerge,
    },
    fields: (record.fields ?? []).map((field) => ({
      field_id: field.id,
      value_kind: field.valueKind,
      description: field.description,
      sensitive: field.sensitive,
      enum: field.enum,
    })),
    description: record.description,
  };
}

function mapMatchSignals(docType) {
  const signals = docType.recognitionSignals ?? [];
  const titlePatterns = signals.slice(0, 3);
  const keywords = signals.slice(3);
  const negative = [];
  if (docType.id === "iep.plan") {
    negative.push("progress report", "progress toward");
  }
  if (docType.id === "iep.progress") {
    negative.push("individualized education program");
  }
  if (docType.id.startsWith("iep.evaluation.")) {
    negative.push("individualized education program", "progress report");
  }
  return {
    title_patterns: titlePatterns,
    title_only_patterns: titlePatterns.slice(0, 2),
    keywords,
    body_keywords: keywords,
    section_headers: [],
    negative_keywords: negative,
    filename_patterns: docType.id.includes(".")
      ? [docType.id.split(".").pop().replace(/_/g, " ")]
      : [],
    disambiguation_priority:
      docType.id === "iep.plan" || docType.id === "iep.progress" ? 10 : 5,
    min_pages: docType.id === "iep.plan" ? 2 : undefined,
  };
}

const l001FilenameHints = {
  "iep.referral": ["referral", "initial_referral"],
  "iep.evaluation.plan": ["evaluation_plan"],
  "iep.consent": ["consent", "parent_evaluation"],
  "iep.evaluation.psychoeducational": ["psychoeducational"],
  "iep.evaluation.academic": ["academic_evaluation"],
  "iep.evaluation.speech_language": ["speech_language"],
  "iep.eligibility": ["eligibility"],
  "iep.plan": ["initial_iep", "annual_iep"],
};

const documentTypes = raw.documentTypes.map((docType) => {
  const match = mapMatchSignals(docType);
  const hints = l001FilenameHints[docType.id];
  if (hints) {
    match.filename_patterns = [...new Set([...(match.filename_patterns ?? []), ...hints])];
    match.disambiguation_priority = 20;
  }
  return {
    document_type_id: docType.id,
    domain_id: raw.manifest.id,
    label: docType.label,
    author_role: docType.authorRole,
    match,
    checklist: docType.checklist ?? [],
    checklist_policy: docType.checklistPolicy,
    document_links: docType.documentLinks ?? [],
    classification_policy: docType.classificationPolicy,
    ordering_date_field: docType.orderingDate,
  };
});

const studentRecord = raw.recordTypes.find((entry) => entry.id === "student");
const manifest = {
  contract_version: "domain-pack-manifest@2",
  pack_id: raw.manifest.id,
  pack_version: "2.0.0",
  review_status: "reviewed",
  supersedes: "1.0.0",
  jurisdictions: raw.manifest.jurisdictions ?? ["US-federal-base"],
  public_surfaces: [
    {
      domain_id: raw.manifest.id,
      label: raw.manifest.name,
      short_label: "IEP",
      front_page: {
        executable: true,
        pill_tone: "iep",
        placeholder:
          "My child’s IEP meeting is next week. What changed from last year, and what should I ask?",
      },
      starter_suggestions: (raw.audiences?.[0]?.defaultQuestions ?? [])
        .slice(0, 3)
        .map((question, index) => ({
          title: `IEP question ${index + 1}`,
          fill: question,
        })),
    },
  ],
  domains: [
    {
      domain_id: raw.manifest.id,
      label: raw.manifest.name,
      vocabulary_fields: (studentRecord?.fields ?? []).map((field) => ({
        field_key: `student.${field.id}`,
        title: `Student ${field.id}`,
        value_type: field.valueKind === "date" ? "date" : "string",
        reusable: true,
        evidence_required: true,
      })),
    },
  ],
  document_types: documentTypes,
  record_types: raw.recordTypes.map(mapRecordType),
  constructs: raw.constructs ?? {},
  relationship_rules: raw.relationshipRules ?? {},
  reading_notes: {
    global: raw.readingNotes?.global,
    by_document_type: raw.readingNotes?.byDocumentType ?? {},
  },
  plain_explainers: raw.plainExplainers ?? {},
  vocabulary: raw.vocabulary ?? {},
};

const outDir = join(repoRoot, "domain-packs", "iep", "2.0.0");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "manifest.json");
writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Wrote ${outPath} (${documentTypes.length} document types, ${manifest.record_types.length} record types)`);
