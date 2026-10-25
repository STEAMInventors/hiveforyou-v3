import { describe, expect, it } from "vitest";

import { parsePackExtractionOwnerViewV1 } from "./owner-view.js";

const VIEW = {
  contract_version: "pack-extraction-owner-view@1",
  study_run_id: "run-1",
  hive_id: "hive-1",
  batches: [
    {
      batch_id: "b1",
      source_document_id: "doc-1",
      filename: "a.pdf",
      page_start: 1,
      page_end: 1,
      is_partial: false,
      status: "SUCCEEDED",
      disposition: "VALID",
      classification_status: "CLASSIFIED",
      primary_document_type_id: "iep.plan",
      pack_id: "iep",
      pack_version: "2.0.0",
      counts: { records: 0, facts_accepted: 0, facts_rejected: 0, records_rejected: 0 },
      rejection_reason_codes: [],
      error_code: null,
      error_reason: null,
      reused: false,
      accepted_facts: [],
    },
  ],
};

describe("parsePackExtractionOwnerViewV1", () => {
  it("accepts the owner RPC projection, as an object or JSON text", () => {
    expect(parsePackExtractionOwnerViewV1(VIEW).ok).toBe(true);
    expect(parsePackExtractionOwnerViewV1(JSON.stringify(VIEW)).ok).toBe(true);
  });

  it("rejects wrong versions and malformed batches", () => {
    expect(parsePackExtractionOwnerViewV1({ ...VIEW, contract_version: "x@1" })).toMatchObject({ ok: false });
    expect(parsePackExtractionOwnerViewV1("{")).toMatchObject({ ok: false });
    expect(
      parsePackExtractionOwnerViewV1({ ...VIEW, batches: [{ ...VIEW.batches[0], status: "RUNNING" }] }),
    ).toMatchObject({ ok: false, field: "batches[0]" });
  });
});
