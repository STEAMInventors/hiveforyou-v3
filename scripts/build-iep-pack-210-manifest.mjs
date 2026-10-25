/**
 * One-shot builder for domain-packs/iep/2.1.0/manifest.json from reviewed 2.0.0.
 * Maps IEP-PACK-2.1.0-ADDITIONS-SPEC.md P0/P1 items. Safe to re-run.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(repoRoot, "domain-packs/iep/2.0.0/manifest.json");
const targetPath = join(repoRoot, "domain-packs/iep/2.1.0/manifest.json");

const manifest = JSON.parse(readFileSync(sourcePath, "utf8"));

manifest.pack_version = "2.1.0";
manifest.supersedes = "2.0.0";
manifest.review_status = "draft";

function findDoc(id) {
  const doc = manifest.document_types.find((d) => d.document_type_id === id);
  if (!doc) throw new Error(`Missing document type ${id}`);
  return doc;
}

function findRecord(id) {
  const rec = manifest.record_types.find((r) => r.record_type_id === id);
  if (!rec) throw new Error(`Missing record type ${id}`);
  return rec;
}

function mergeUnique(arr, items) {
  const set = new Set(arr ?? []);
  for (const item of items) set.add(item);
  return [...set];
}

function candidateMatchToV2({ title_signals, body_signals, negative_title_signals, filename_signals, disambiguation_priority }) {
  return {
    title_patterns: title_signals,
    title_only_patterns: title_signals,
    keywords: body_signals,
    body_keywords: body_signals,
    section_headers: [],
    negative_keywords: negative_title_signals ?? [],
    filename_patterns: filename_signals ?? [],
    disambiguation_priority,
  };
}

// P1-10 — public starter suggestions (spec §9)
manifest.public_surfaces[0].starter_suggestions = [
  { title: "Current plan", fill: "What does the current plan give my child?" },
  { title: "Changes", fill: "What changed since the last plan?" },
  { title: "Progress", fill: "Is my child making progress on each goal?" },
  { title: "Gaps", fill: "What is missing or unclear in these documents?" },
  { title: "Meeting prep", fill: "What should I ask at the next meeting?" },
];

// P0-19 — iep.plan title-zone negatives
const plan = findDoc("iep.plan");
plan.match.negative_keywords = mergeUnique(plan.match.negative_keywords, [
  "amendment",
  "prior written notice",
  "functional behavioral assessment",
  "behavior intervention plan",
  "meeting notes",
  "meeting minutes",
]);

// P0-20 — iep.progress (already rejects IEP title; keep explicit)
const progress = findDoc("iep.progress");
progress.match.negative_keywords = mergeUnique(progress.match.negative_keywords, [
  "individualized education program",
]);

// P0-21 — evaluation types shared negatives
const evalNegatives = [
  "individualized education program",
  "progress report",
  "eligibility determination",
  "eligibility report",
];
for (const id of [
  "iep.evaluation.academic",
  "iep.evaluation.psychoeducational",
  "iep.evaluation.speech_language",
  "iep.evaluation.independent",
  "iep.evaluation.plan",
]) {
  const doc = findDoc(id);
  doc.match.negative_keywords = mergeUnique(doc.match.negative_keywords, evalNegatives);
}

// P0-22 — FBA / BIP mutual negatives
findDoc("iep.behavior.fba").match.negative_keywords = mergeUnique(
  findDoc("iep.behavior.fba").match.negative_keywords,
  ["behavior intervention plan", "BIP"],
);
findDoc("iep.behavior.bip").match.negative_keywords = mergeUnique(
  findDoc("iep.behavior.bip").match.negative_keywords,
  ["functional behavioral assessment", "FBA"],
);

// P0-25 — iep.consent permission/signature signal
const consent = findDoc("iep.consent");
consent.match.title_patterns = mergeUnique(consent.match.title_patterns, [
  "permission to evaluate",
  "parent signature",
]);
consent.match.title_only_patterns = mergeUnique(consent.match.title_only_patterns, [
  "permission to evaluate",
]);
consent.match.keywords = mergeUnique(consent.match.keywords, [
  "I give permission",
  "I do not give permission",
  "signature",
]);
consent.match.body_keywords = mergeUnique(consent.match.body_keywords, consent.match.keywords);
consent.classification_policy =
  "propose_with_evidence_or_unresolved; requires permission or signature signal — body word consent alone inside another document type is insufficient";

// P1-14 — parent.correspondence weak Dear in body only
const parentCorr = findDoc("parent.correspondence");
parentCorr.match.title_patterns = parentCorr.match.title_patterns.filter((p) => p !== "Dear");
parentCorr.match.title_only_patterns = parentCorr.match.title_only_patterns.filter((p) => p !== "Dear");
parentCorr.match.body_keywords = mergeUnique(parentCorr.match.body_keywords, ["Dear"]);
parentCorr.match.keywords = mergeUnique(parentCorr.match.keywords, ["Dear"]);

// P0-01 — iep.behavior.observation
manifest.document_types.push({
  document_type_id: "iep.behavior.observation",
  domain_id: "iep",
  label: "Behavior tracking or incident summary",
  author_role: "school_evaluator",
  match: candidateMatchToV2({
    title_signals: ["behavior tracking", "incident summary", "classroom behavior"],
    body_signals: ["incident"],
    negative_title_signals: [
      "functional behavioral assessment",
      "behavior intervention plan",
      "individualized education program",
      "FBA",
      "BIP",
    ],
    filename_signals: ["behavior_tracking", "incident_summary", "behavior"],
    disambiguation_priority: 40,
  }),
  checklist: ["document_header", "student", "behavior_incident", "measurement"],
  checklist_policy: "look_for_all_listed; never_invent_if_absent; extract_other_pack_records_if_found",
  document_links: ["references_plan"],
  classification_policy: "propose_with_evidence_or_unresolved",
  ordering_date_field: "document_header.document_date",
});

// P0-02 — iep.meeting.notes
manifest.document_types.push({
  document_type_id: "iep.meeting.notes",
  domain_id: "iep",
  label: "IEP meeting notes or minutes",
  author_role: "education_agency",
  match: candidateMatchToV2({
    title_signals: ["meeting notes", "meeting minutes", "IEP team meeting"],
    body_signals: ["participants", "discussed"],
    negative_title_signals: ["prior written notice", "individualized education program"],
    filename_signals: ["meeting_notes"],
    disambiguation_priority: 45,
  }),
  checklist: ["document_header", "student", "meeting", "meeting_participant"],
  checklist_policy: "look_for_all_listed; never_invent_if_absent; extract_other_pack_records_if_found",
  document_links: ["references_plan"],
  classification_policy: "propose_with_evidence_or_unresolved",
  ordering_date_field: "meeting.meeting_date",
});

// P0-03 / P1-13 — iep.meeting.notice (lower priority vs minutes/PWN)
manifest.document_types.push({
  document_type_id: "iep.meeting.notice",
  domain_id: "iep",
  label: "Notice of an IEP meeting",
  author_role: "education_agency",
  match: candidateMatchToV2({
    title_signals: ["notice of meeting", "meeting notice"],
    body_signals: ["you are invited"],
    negative_title_signals: ["prior written notice", "meeting minutes", "meeting notes", "PWN"],
    filename_signals: ["meeting_notice"],
    disambiguation_priority: 30,
  }),
  checklist: ["document_header", "student", "meeting"],
  checklist_policy: "look_for_all_listed; never_invent_if_absent; extract_other_pack_records_if_found",
  document_links: ["references_plan"],
  classification_policy: "propose_with_evidence_or_unresolved",
  ordering_date_field: "meeting.meeting_date",
});

// P0-04 / P0-24 — iep.service.implementation
manifest.document_types.push({
  document_type_id: "iep.service.implementation",
  domain_id: "iep",
  label: "Service delivery or implementation log",
  author_role: "education_agency",
  match: candidateMatchToV2({
    title_signals: ["service log", "implementation log", "service delivery"],
    body_signals: ["sessions provided", "minutes provided"],
    negative_title_signals: ["individualized education program", "annual goals", "IEP"],
    filename_signals: ["service_log", "implementation"],
    disambiguation_priority: 45,
  }),
  checklist: ["document_header", "student", "service_delivery_observation"],
  checklist_policy: "look_for_all_listed; never_invent_if_absent; extract_other_pack_records_if_found",
  document_links: ["observes_commitment"],
  classification_policy: "propose_with_evidence_or_unresolved",
  ordering_date_field: "service_delivery_observation.period_end",
});

// P1-08 / P1-09 — document_header.subtype enums (tracking/incident for observation docs)
const header = findRecord("document_header");
header.fields.find((f) => f.field_id === "subtype").enum = mergeUnique(
  header.fields.find((f) => f.field_id === "subtype").enum,
  ["tracking", "incident"],
);

// P0-05–08 — new record types
manifest.record_types.push(
  {
    record_type_id: "service_delivery_observation",
    label: "Service delivery observation",
    group: "service",
    repeatable: true,
    identity: {
      scope: "case",
      key_fields: ["service_type", "period_start", "period_end"],
      key_fields_if_present: ["provider_role", "location"],
      disambiguators: [],
      version_axis: "document.orderingDate",
    },
    fields: [
      { field_id: "service_type", value_kind: "text" },
      {
        field_id: "category",
        value_kind: "code",
        enum: [
          "special_education",
          "related_service",
          "supplementary_aid",
          "program_modification",
          "support_for_personnel",
        ],
      },
      { field_id: "period_start", value_kind: "date" },
      { field_id: "period_end", value_kind: "date" },
      { field_id: "minutes_documented", value_kind: "quantity" },
      { field_id: "sessions_documented", value_kind: "quantity" },
      { field_id: "provider_role", value_kind: "text" },
      { field_id: "location", value_kind: "text" },
      { field_id: "note", value_kind: "text" },
    ],
    description:
      "Documented delivery of services (observed modality). Absence of this record is not proof of non-delivery.",
  },
  {
    record_type_id: "behavior_incident",
    label: "Behavior incident",
    group: "behavior",
    repeatable: true,
    identity: {
      scope: "document",
      key_fields: ["incident_date", "description"],
      key_fields_if_present: [],
      disambiguators: ["setting"],
      cross_document_merge: "independent_assertions",
      version_axis: "document.orderingDate",
    },
    fields: [
      { field_id: "incident_date", value_kind: "date" },
      { field_id: "description", value_kind: "text" },
      { field_id: "setting", value_kind: "text" },
      { field_id: "count", value_kind: "quantity" },
    ],
    description: "One incident row per record. Similar incidents are not merged across documents.",
  },
);

// P0-09–10 — goal designation and identity
const goal = findRecord("goal");
goal.identity.key_fields = ["measure.task", "measure.score_type"];
goal.identity.key_fields_if_present = ["area", "designation"];
goal.fields.splice(
  goal.fields.findIndex((f) => f.field_id === "area") + 1,
  0,
  {
    field_id: "designation",
    value_kind: "text",
    description: 'Optional quoted label such as "Goal 1"; never inferred',
  },
);

// P0-11–14 — evaluation_plan_item
const epi = findRecord("evaluation_plan_item");
epi.identity.scope = "document";
epi.identity.key_fields = ["list_section", "line_text"];
epi.fields.push(
  {
    field_id: "list_section",
    value_kind: "code",
    enum: [
      "existing_information_available",
      "proposed_areas_for_evaluation",
      "information_to_be_gathered",
    ],
  },
  { field_id: "line_text", value_kind: "text" },
  {
    field_id: "selected",
    value_kind: "code",
    enum: ["selected", "not_selected"],
  },
);

// P0-15–16 — accommodation kind and context enum
const accommodation = findRecord("accommodation");
accommodation.fields.splice(1, 0, {
  field_id: "kind",
  value_kind: "code",
  enum: ["accommodation", "modification", "unspecified"],
});
const contextField = accommodation.fields.find((f) => f.field_id === "context");
contextField.enum = mergeUnique(contextField.enum, ["state_district_assessment"]);

// P0-17 — student_id
findRecord("student").fields.push({
  field_id: "student_id",
  value_kind: "text",
  sensitive: true,
});

// P0-18 — meeting_participant identity
findRecord("meeting_participant").identity.key_fields_if_present = ["name"];

// P1-12 — temporal succession fields
manifest.relationship_rules.temporalSuccessionFieldIds = mergeUnique(
  manifest.relationship_rules.temporalSuccessionFieldIds,
  ["period_start", "period_end", "incident_date"],
);

// P1-06 — typed link catalog (declarations only)
manifest.relationship_rules.typedLinks = [
  { id: "initiates_evaluation", from: "referral", to: "evaluation_plan_item" },
  { id: "authorizes_evaluation", from: "consent", to: "evaluation_plan_item" },
  { id: "proposes_assessment", from: "evaluation_plan_item", to: "measurement" },
  { id: "supports_eligibility", from: "evaluation_finding", to: "eligibility" },
  { id: "supports_eligibility", from: "measurement", to: "eligibility" },
  { id: "documents_need", from: "evaluation_finding", to: "present_level" },
  { id: "grounds_goal", from: "present_level", to: "goal" },
  { id: "has_objective", from: "goal", to: "short_term_objective" },
  { id: "addressed_by_service", from: "goal", to: "service" },
  { id: "reports_progress_on", from: "progress_entry", to: "goal" },
  { id: "same_measure_as", from: "measurement", to: "goal" },
  { id: "observes_commitment", from: "service_delivery_observation", to: "service" },
  { id: "scoped_amendment_of", from: "amendment_change", to: "affected_record_type" },
  { id: "succeeds_plan", from: "iep.plan", to: "iep.plan" },
  { id: "references_action", from: "school_action", to: "consent" },
  { id: "responds_to_request", from: "school_action", to: "parent_request" },
  { id: "informed_by_fba", from: "behavior_target", to: "behavior_target" },
  { id: "has_participant", from: "meeting", to: "meeting_participant" },
  { id: "independent_of", from: "evaluation_finding", to: "evaluation_finding" },
];

// P1-11 / P1-07 — reading notes
manifest.reading_notes.global =
  `${manifest.reading_notes.global} Compound PDFs: when span boundaries are uncertain, keep one source document, classify at partial tier, and do not invent a page split. Logical succession (unchanged plan sections) is described in reading notes until the engine supports an explicit unchangedRequiresLogicalSuccession flag.`;

manifest.reading_notes.by_document_type["iep.behavior.observation"] =
  "Subtype tracking vs incident comes from document_header.subtype when the form states it. Incidents are separate behavior_incident records; do not merge into an FBA or BIP. Reject FBA, BIP, and full IEP titles.";
manifest.reading_notes.by_document_type["iep.meeting.notes"] =
  "Meeting notes or minutes are not an IEP plan. Extract meeting and meeting_participant rows; do not invent goals or services.";
manifest.reading_notes.by_document_type["iep.meeting.notice"] =
  "Invitation to an IEP meeting is not prior written notice and not meeting minutes. Extract meeting date and purpose when quoted.";
manifest.reading_notes.by_document_type["iep.service.implementation"] =
  "These rows are observed delivery (service_delivery_observation), not planned service rows from an IEP. A service grid inside an IEP stays iep.plan with service records.";

// P1-02 — plain explainers
manifest.plain_explainers.byRecordType.service_delivery_observation =
  "What the school documented as actually provided for a service over a period — not what the IEP promised.";
manifest.plain_explainers.byRecordType.behavior_incident =
  "A single behavior incident the school recorded, with when and where it happened.";

// P1-05 — vocabulary ORF already present in 2.0.0; ensure value token
const orfSyn = manifest.vocabulary.fieldSynonyms.find(
  (e) => e.field === "measure.task" && e.value === "reading fluency",
);
if (orfSyn) {
  orfSyn.terms = mergeUnique(orfSyn.terms, ["ORF", "oral reading fluency"]);
}

mkdirSync(dirname(targetPath), { recursive: true });
writeFileSync(targetPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Wrote ${targetPath}`);
console.log(`document_types: ${manifest.document_types.length}`);
console.log(`record_types: ${manifest.record_types.length}`);
