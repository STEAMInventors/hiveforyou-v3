import type {
  PackExtractionOwnerBatchV1,
  PackExtractionOwnerEvidenceV1,
  PackExtractionOwnerFactV1,
  PackExtractionOwnerViewV1,
} from "@hiveforyou/contracts/pack-extraction/v1";

import type { DomainPackDisplayLabels } from "@/lib/domain-packs/public-metadata";

export type ExtractedDocumentView = {
  source_document_id: string;
  filename: string;
  document_type_id: string | null;
  pack_id: string;
  pack_version: string;
  status: "extracted" | "extracted_with_rejections" | "unrecognized" | "failed";
  pages: string;
  page_count: number;
  set_aside_count: number;
  rejection_reason_codes: string[];
  error_reason: string | null;
  facts: PackExtractionOwnerFactV1[];
};

function documentStatus(batches: PackExtractionOwnerBatchV1[]): ExtractedDocumentView["status"] {
  if (batches.some((batch) => batch.status === "FAILED")) return "failed";
  if (batches.some((batch) => batch.disposition === "VALID_WITH_REJECTIONS")) {
    return "extracted_with_rejections";
  }
  if (batches.every((batch) => batch.disposition === "UNRECOGNIZED")) return "unrecognized";
  return "extracted";
}

/** Groups page-window batches into one row per source document, preserving RPC order. */
export function groupExtractionByDocument(view: PackExtractionOwnerViewV1): ExtractedDocumentView[] {
  const order: string[] = [];
  const byDoc = new Map<string, PackExtractionOwnerBatchV1[]>();
  for (const batch of view.batches) {
    const list = byDoc.get(batch.source_document_id);
    if (list) {
      list.push(batch);
    } else {
      order.push(batch.source_document_id);
      byDoc.set(batch.source_document_id, [batch]);
    }
  }
  return order.map((docId) => {
    const batches = byDoc.get(docId) ?? [];
    const first = batches[0];
    const pageStart = Math.min(...batches.map((batch) => batch.page_start));
    const pageEnd = Math.max(...batches.map((batch) => batch.page_end));
    const pagesCovered = new Set<number>();
    for (const batch of batches) {
      for (let page = batch.page_start; page <= batch.page_end; page += 1) pagesCovered.add(page);
    }
    const seenFacts = new Set<string>();
    const facts: PackExtractionOwnerFactV1[] = [];
    for (const batch of batches) {
      for (const fact of batch.accepted_facts ?? []) {
        const key = `${fact.fact_id}|${JSON.stringify(fact.value ?? null)}|${fact.status}`;
        if (seenFacts.has(key)) continue;
        seenFacts.add(key);
        facts.push(fact);
      }
    }
    return {
      source_document_id: docId,
      filename: first?.filename ?? "",
      document_type_id: batches.find((batch) => batch.primary_document_type_id)?.primary_document_type_id ?? null,
      pack_id: first?.pack_id ?? "",
      pack_version: first?.pack_version ?? "",
      status: documentStatus(batches),
      pages: pageStart === pageEnd ? `p. ${pageStart}` : `pp. ${pageStart}–${pageEnd}`,
      page_count: pagesCovered.size,
      set_aside_count: batches.reduce(
        (sum, batch) => sum + (batch.counts?.facts_rejected ?? 0) + (batch.counts?.records_rejected ?? 0),
        0,
      ),
      rejection_reason_codes: [...new Set(batches.flatMap((batch) => batch.rejection_reason_codes))],
      error_reason: batches.find((batch) => batch.error_reason)?.error_reason ?? null,
      facts,
    };
  });
}

export type LabelLookup = (packId: string, packVersion: string) => DomainPackDisplayLabels | undefined;

export type AnalysisFact = {
  key: string;
  record_type_id: string;
  record_label: string;
  field_label: string;
  value_text: string;
  status: "OBSERVED" | "UNCERTAIN";
  evidence: PackExtractionOwnerEvidenceV1[];
  source_document_id: string;
  filename: string;
  document_label: string;
  page_label: string;
};

export type AnalysisTopicGroup = {
  source_document_id: string;
  document_label: string;
  filename: string;
  facts: AnalysisFact[];
};

export type AnalysisTopic = {
  id: string;
  record_type_id: string;
  label: string;
  count: number;
  groups: AnalysisTopicGroup[];
};

export type AnalysisDocument = {
  source_document_id: string;
  filename: string;
  document_label: string;
  pages: string;
  read_state: "read" | "unrecognized" | "failed";
  uncertain_count: number;
  set_aside_count: number;
  facts: AnalysisFact[];
  not_stated: string[];
};

export type AnalysisNotFound = {
  key: string;
  record_label: string;
  field_label: string;
  documents: string[];
};

export type AnalysisSummary = {
  documents_total: number;
  documents_read: number;
  documents_not_read: string[];
  pages_read: number;
  items: number;
  uncertain: number;
  not_found: number;
  set_aside: number;
  set_aside_reasons: string[];
};

export type AnalysisView = {
  has_pack_extraction: boolean;
  summary: AnalysisSummary;
  topics: AnalysisTopic[];
  documents: AnalysisDocument[];
  not_found: AnalysisNotFound[];
};

const SET_ASIDE_REASON: Record<string, string> = {
  UNKNOWN_FACT_ID: "it wasn't one of the items the Domain Pack defines",
  FACT_NOT_IN_RECORD_TYPE: "it was filed under the wrong kind of item",
  TYPE_MISMATCH: "the value wasn't in the expected form",
  ENUM_INVALID: "the value wasn't one of the allowed options",
  MISSING_EVIDENCE: "no words from the page were given for it",
  PAGE_OUT_OF_RANGE: "it pointed to a page outside the document",
  QUOTE_NOT_IN_PAGE: "the quoted words couldn't be found on the page",
  VALUE_WITH_NON_OBSERVED_STATUS: "it was marked not found but still had a value",
  UNKNOWN_RECORD_TYPE: "it wasn't a kind of item the Domain Pack defines",
  DUPLICATE_NON_REPEATABLE_RECORD: "it repeated an item that should appear only once",
  SEGMENT_REF_INVALID: "it pointed to a part of the document that doesn't exist",
};

export function setAsideReasonText(code: string): string {
  return SET_ASIDE_REASON[code] ?? "it didn't pass a check";
}

function sentenceCase(text: string): string {
  const spaced = text.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : "";
}

/** Generic readable form for ids the Pack doesn't label (e.g. `minutes_per_week`). */
export function humanizeId(id: string): string {
  return sentenceCase(id) || id;
}

export function fieldLabel(factId: string, recordTypeId: string): string {
  const prefix = `${recordTypeId}.`;
  const local = factId.startsWith(prefix) ? factId.slice(prefix.length) : factId;
  return sentenceCase(local) || factId;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatScalar(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") {
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (iso) {
      const month = Number(iso[2]);
      const day = Number(iso[3]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${MONTHS[month - 1]} ${day}, ${iso[1]}`;
      }
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(formatScalar).filter(Boolean).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, inner]) => {
        const text = formatScalar(inner);
        return text ? `${sentenceCase(key)}: ${text}` : "";
      })
      .filter(Boolean)
      .join("; ");
  }
  return String(value);
}

export function formatFactValue(value: unknown): string {
  return formatScalar(value);
}

function pageLabel(evidence: PackExtractionOwnerEvidenceV1[]): string {
  const pages = [...new Set(evidence.map((anchor) => anchor.page_number))].sort((a, b) => a - b);
  if (pages.length === 0) return "";
  return pages.length === 1 ? `p. ${pages[0]}` : `pp. ${pages.join(", ")}`;
}

function topicDomId(recordTypeId: string): string {
  return `analysis-topic-${recordTypeId.toLowerCase().replace(/[^a-z0-9-]+/g, "-")}`;
}

/** Builds the Analysis Complete projection from persisted Pack extraction; labels come only from the Pack. */
export function buildAnalysisView(view: PackExtractionOwnerViewV1, lookupLabels: LabelLookup): AnalysisView {
  const docs = groupExtractionByDocument(view);
  const recordOrder = new Map<string, number>();
  const recordLabels = new Map<string, string>();

  function labelsFor(doc: ExtractedDocumentView) {
    const labels = lookupLabels(doc.pack_id, doc.pack_version);
    labels?.record_types.forEach((type, index) => {
      if (!recordOrder.has(type.id)) recordOrder.set(type.id, index);
      if (!recordLabels.has(type.id)) recordLabels.set(type.id, type.label);
    });
    return labels;
  }

  function documentLabel(doc: ExtractedDocumentView, labels: DomainPackDisplayLabels | undefined): string {
    if (doc.status === "failed") return doc.filename;
    if (!doc.document_type_id) return "Not a recognized document type";
    return (
      labels?.document_types.find((type) => type.id === doc.document_type_id)?.label ??
      humanizeId(doc.document_type_id)
    );
  }

  const recordLabel = (id: string) => recordLabels.get(id) ?? humanizeId(id);

  const topicsById = new Map<string, AnalysisTopic>();
  const firstSeen: string[] = [];
  const notFoundByField = new Map<string, AnalysisNotFound>();
  const documents: AnalysisDocument[] = [];
  const setAsideCodes = new Set<string>();

  for (const doc of docs) {
    const labels = labelsFor(doc);
    const docLabel = documentLabel(doc, labels);
    const found = new Set<string>();
    const facts: AnalysisFact[] = [];
    doc.facts.forEach((fact, index) => {
      if (fact.status !== "OBSERVED" && fact.status !== "UNCERTAIN") return;
      found.add(fact.fact_id);
      facts.push({
        key: `${doc.source_document_id}:${index}`,
        record_type_id: fact.record_type_id,
        record_label: recordLabel(fact.record_type_id),
        field_label: fieldLabel(fact.fact_id, fact.record_type_id),
        value_text: formatFactValue(fact.value),
        status: fact.status,
        evidence: fact.evidence,
        source_document_id: doc.source_document_id,
        filename: doc.filename,
        document_label: docLabel,
        page_label: pageLabel(fact.evidence),
      });
    });

    const notStated: string[] = [];
    const notStatedSeen = new Set<string>();
    for (const fact of doc.facts) {
      if (fact.status !== "NOT_FOUND" || found.has(fact.fact_id) || notStatedSeen.has(fact.fact_id)) continue;
      notStatedSeen.add(fact.fact_id);
      const record = recordLabel(fact.record_type_id);
      const field = fieldLabel(fact.fact_id, fact.record_type_id);
      notStated.push(`${record} · ${field}`);
      const key = fact.fact_id;
      const entry = notFoundByField.get(key);
      if (entry) {
        if (!entry.documents.includes(doc.filename)) entry.documents.push(doc.filename);
      } else {
        notFoundByField.set(key, { key, record_label: record, field_label: field, documents: [doc.filename] });
      }
    }

    for (const fact of facts) {
      let topic = topicsById.get(fact.record_type_id);
      if (!topic) {
        topic = {
          id: topicDomId(fact.record_type_id),
          record_type_id: fact.record_type_id,
          label: fact.record_label,
          count: 0,
          groups: [],
        };
        topicsById.set(fact.record_type_id, topic);
        firstSeen.push(fact.record_type_id);
      }
      topic.count += 1;
      let group = topic.groups.find((entry) => entry.source_document_id === doc.source_document_id);
      if (!group) {
        group = {
          source_document_id: doc.source_document_id,
          document_label: docLabel,
          filename: doc.filename,
          facts: [],
        };
        topic.groups.push(group);
      }
      group.facts.push(fact);
    }

    if (doc.set_aside_count > 0) doc.rejection_reason_codes.forEach((code) => setAsideCodes.add(code));
    documents.push({
      source_document_id: doc.source_document_id,
      filename: doc.filename,
      document_label: docLabel,
      pages: doc.pages,
      read_state: doc.status === "failed" ? "failed" : doc.status === "unrecognized" ? "unrecognized" : "read",
      uncertain_count: facts.filter((fact) => fact.status === "UNCERTAIN").length,
      set_aside_count: doc.set_aside_count,
      facts,
      not_stated: notStated,
    });
  }

  const unordered = Number.MAX_SAFE_INTEGER;
  const topics = [...topicsById.values()].sort((a, b) => {
    const left = recordOrder.get(a.record_type_id) ?? unordered;
    const right = recordOrder.get(b.record_type_id) ?? unordered;
    if (left !== right) return left - right;
    return firstSeen.indexOf(a.record_type_id) - firstSeen.indexOf(b.record_type_id);
  });

  const allFacts = documents.flatMap((doc) => doc.facts);
  const readDocs = docs.filter((doc) => doc.status !== "failed");
  return {
    has_pack_extraction: docs.length > 0,
    summary: {
      documents_total: docs.length,
      documents_read: readDocs.length,
      documents_not_read: docs.filter((doc) => doc.status === "failed").map((doc) => doc.filename),
      pages_read: readDocs.reduce((sum, doc) => sum + doc.page_count, 0),
      items: allFacts.length,
      uncertain: allFacts.filter((fact) => fact.status === "UNCERTAIN").length,
      not_found: notFoundByField.size,
      set_aside: docs.reduce((sum, doc) => sum + doc.set_aside_count, 0),
      set_aside_reasons: [...setAsideCodes].map(setAsideReasonText),
    },
    topics,
    documents,
    not_found: [...notFoundByField.values()],
  };
}
