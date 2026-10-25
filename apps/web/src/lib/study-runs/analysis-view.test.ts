import type {
  PackExtractionOwnerBatchV1,
  PackExtractionOwnerFactV1,
  PackExtractionOwnerViewV1,
} from "@hiveforyou/contracts/pack-extraction/v1";
import { describe, expect, it } from "vitest";

import {
  getDomainPackDisplayLabels,
  type DomainPackDisplayLabels,
} from "@/lib/domain-packs/public-metadata";
import {
  buildAnalysisView,
  fieldLabel,
  formatFactValue,
  setAsideReasonText,
} from "@/lib/study-runs/analysis-view";

/** Disposable second Pack: proves topics come from Pack data, not domain branches. */
const SYNTHETIC: DomainPackDisplayLabels = {
  pack_id: "synthetic-receipts",
  pack_version: "0.1.0",
  document_types: [{ id: "receipt.store", label: "Store receipt" }],
  record_types: [
    { id: "store", label: "Store", group: "header" },
    { id: "line_item", label: "Item bought", group: "items" },
  ],
};

const lookup = (packId: string, version: string) =>
  packId === SYNTHETIC.pack_id && version === SYNTHETIC.pack_version ? SYNTHETIC : undefined;

function fact(overrides: Partial<PackExtractionOwnerFactV1>): PackExtractionOwnerFactV1 {
  return {
    record_type_id: "line_item",
    record_local_id: "r1",
    parent_record_local_id: null,
    segment_index: 0,
    fact_id: "line_item.name",
    status: "OBSERVED",
    value: "Apples",
    evidence: [{ page_number: 1, exact_quote: "APPLES 2.50" }],
    ...overrides,
  };
}

function batch(overrides: Partial<PackExtractionOwnerBatchV1>): PackExtractionOwnerBatchV1 {
  return {
    batch_id: "b1",
    source_document_id: "doc-1",
    filename: "receipt-1.pdf",
    page_start: 1,
    page_end: 1,
    is_partial: false,
    status: "SUCCEEDED",
    disposition: "VALID",
    classification_status: "CLASSIFIED",
    primary_document_type_id: "receipt.store",
    pack_id: SYNTHETIC.pack_id,
    pack_version: SYNTHETIC.pack_version,
    counts: { records: 1, facts_accepted: 1, facts_rejected: 0, records_rejected: 0 },
    rejection_reason_codes: [],
    error_code: null,
    error_reason: null,
    reused: false,
    accepted_facts: [],
    ...overrides,
  };
}

function view(batches: PackExtractionOwnerBatchV1[]): PackExtractionOwnerViewV1 {
  return { contract_version: "pack-extraction-owner-view@1", study_run_id: "run", hive_id: "hive", batches };
}

describe("buildAnalysisView", () => {
  it("orders and labels topics from the selected Pack and groups facts by document", () => {
    const result = buildAnalysisView(
      view([
        batch({
          accepted_facts: [
            fact({}),
            fact({ record_type_id: "store", fact_id: "store.name", value: "Corner Market", evidence: [{ page_number: 1, exact_quote: "CORNER MARKET" }] }),
            fact({ record_type_id: "loyalty_note", fact_id: "loyalty_note.text", value: "Points earned" }),
          ],
        }),
        batch({ batch_id: "b2", source_document_id: "doc-2", filename: "receipt-2.pdf", accepted_facts: [fact({ value: "Bread" })] }),
      ]),
      lookup,
    );
    expect(result.topics.map((topic) => topic.label)).toEqual(["Store", "Item bought", "Loyalty note"]);
    const items = result.topics[1]!;
    expect(items.count).toBe(2);
    expect(items.groups.map((group) => [group.document_label, group.filename])).toEqual([
      ["Store receipt", "receipt-1.pdf"],
      ["Store receipt", "receipt-2.pdf"],
    ]);
    expect(items.groups[0]!.facts[0]).toMatchObject({
      field_label: "Name",
      value_text: "Apples",
      page_label: "p. 1",
      status: "OBSERVED",
    });
    expect(items.id).toBe("analysis-topic-line-item");
  });

  it("de-duplicates overlapping windows and only lists a field as not found when no window found it", () => {
    const result = buildAnalysisView(
      view([
        batch({
          page_end: 2,
          is_partial: true,
          accepted_facts: [
            fact({}),
            fact({ fact_id: "line_item.price", status: "NOT_FOUND", value: undefined, evidence: [] }),
            fact({ fact_id: "line_item.discount", status: "NOT_FOUND", value: undefined, evidence: [] }),
            fact({ fact_id: "line_item.tax_code", status: "NOT_APPLICABLE", value: undefined, evidence: [] }),
          ],
        }),
        batch({
          batch_id: "b1b",
          page_start: 2,
          page_end: 3,
          is_partial: true,
          accepted_facts: [
            fact({}),
            fact({ fact_id: "line_item.price", status: "UNCERTAIN", value: 2.5, reason_code: "blurry", evidence: [{ page_number: 2, exact_quote: "2.5?" }] }),
          ],
        }),
        batch({
          batch_id: "b2",
          source_document_id: "doc-2",
          filename: "receipt-2.pdf",
          accepted_facts: [fact({ fact_id: "line_item.discount", status: "NOT_FOUND", value: undefined, evidence: [] })],
        }),
      ]),
      lookup,
    );
    expect(result.documents[0]!.facts).toHaveLength(2);
    expect(result.documents[0]!.pages).toBe("pp. 1–3");
    expect(result.documents[0]!.uncertain_count).toBe(1);
    expect(result.documents[0]!.not_stated).toEqual(["Item bought · Discount"]);
    expect(result.not_found).toEqual([
      {
        key: "line_item.discount",
        record_label: "Item bought",
        field_label: "Discount",
        documents: ["receipt-1.pdf", "receipt-2.pdf"],
      },
    ]);
    expect(result.summary).toMatchObject({ items: 2, uncertain: 1, not_found: 1, pages_read: 4 });
  });

  it("reports failed, unrecognized and set-aside documents without inventing facts", () => {
    const result = buildAnalysisView(
      view([
        batch({
          disposition: "VALID_WITH_REJECTIONS",
          counts: { records: 1, facts_accepted: 1, facts_rejected: 2, records_rejected: 0 },
          rejection_reason_codes: ["QUOTE_NOT_IN_PAGE"],
          accepted_facts: [fact({})],
        }),
        batch({ batch_id: "b2", source_document_id: "doc-2", filename: "photo.jpg", disposition: "UNRECOGNIZED", primary_document_type_id: null }),
        batch({
          batch_id: "b3",
          source_document_id: "doc-3",
          filename: "broken.pdf",
          status: "FAILED",
          disposition: "UNUSABLE",
          counts: null,
          error_code: "MODEL_OUTPUT_INVALID",
          error_reason: "output_not_json",
        }),
      ]),
      lookup,
    );
    expect(result.documents.map((doc) => [doc.document_label, doc.read_state])).toEqual([
      ["Store receipt", "read"],
      ["Not a recognized document type", "unrecognized"],
      ["broken.pdf", "failed"],
    ]);
    expect(result.summary).toMatchObject({
      documents_total: 3,
      documents_read: 2,
      documents_not_read: ["broken.pdf"],
      set_aside: 2,
      set_aside_reasons: ["the quoted words couldn't be found on the page"],
    });
    expect(JSON.stringify(result)).not.toContain("output_not_json");
  });

  it("falls back to readable ids when the run's Pack version has no display labels", () => {
    const result = buildAnalysisView(
      view([batch({ pack_version: "9.9.9", primary_document_type_id: "receipt.store", accepted_facts: [fact({})] })]),
      lookup,
    );
    expect(result.documents[0]!.document_label).toBe("Receipt store");
    expect(result.topics[0]!.label).toBe("Line item");
  });

  it("marks a run without Pack extraction as having no itemized results", () => {
    const result = buildAnalysisView(view([]), lookup);
    expect(result.has_pack_extraction).toBe(false);
    expect(result.topics).toEqual([]);
    expect(result.summary.documents_total).toBe(0);
  });
});

describe("formatting helpers", () => {
  it("formats values generically", () => {
    expect(formatFactValue("2026-10-21")).toBe("Oct 21, 2026");
    expect(formatFactValue("2026-13-40")).toBe("2026-13-40");
    expect(formatFactValue(["a", 2, true])).toBe("a, 2, true");
    expect(formatFactValue({ unit_price: 2.5, currency: "USD" })).toBe("Unit price: 2.5; Currency: USD");
    expect(formatFactValue(null)).toBe("");
  });

  it("labels fields from their id and maps set-aside reasons to plain language", () => {
    expect(fieldLabel("service.minutes_per_week", "service")).toBe("Minutes per week");
    expect(fieldLabel("measurement.measure.instrument", "measurement")).toBe("Measure instrument");
    expect(setAsideReasonText("ENUM_INVALID")).toBe("the value wasn't one of the allowed options");
    expect(setAsideReasonText("SOMETHING_NEW")).toBe("it didn't pass a check");
  });
});

describe("generated Pack display labels", () => {
  it("exposes reviewed Pack labels by exact pin only", () => {
    const iep = getDomainPackDisplayLabels("iep", "2.0.0");
    expect(iep?.record_types.find((type) => type.id === "goal")?.label).toBe("Annual goal");
    expect(iep?.document_types.find((type) => type.id === "iep.plan")?.label).toBe(
      "Individualized Education Program",
    );
    expect(getDomainPackDisplayLabels("iep", "0.0.0")).toBeUndefined();
  });
});
