// @vitest-environment happy-dom

import type { PackExtractionOwnerViewV1 } from "@hiveforyou/contracts/pack-extraction/v1";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ExtractedFactsPanel,
  groupExtractionByDocument,
} from "@/components/workspace/ExtractedFactsPanel";

const HIVE = "11111111-1111-4111-8111-111111111111";
const RUN = "cda6fab3-ff62-4104-955f-feb2355f5351";

function batch(overrides: Partial<PackExtractionOwnerViewV1["batches"][number]>) {
  return {
    batch_id: "b1",
    source_document_id: "doc-1",
    filename: "08_initial_iep.pdf",
    page_start: 1,
    page_end: 2,
    is_partial: false,
    status: "SUCCEEDED" as const,
    disposition: "VALID" as const,
    classification_status: "CLASSIFIED" as const,
    primary_document_type_id: "iep.plan",
    pack_id: "iep",
    pack_version: "2.0.0",
    counts: { records: 1, facts_accepted: 1, facts_rejected: 0, records_rejected: 0 },
    rejection_reason_codes: [],
    error_code: null,
    error_reason: null,
    reused: false,
    accepted_facts: [],
    ...overrides,
  };
}

const VIEW: PackExtractionOwnerViewV1 = {
  contract_version: "pack-extraction-owner-view@1",
  study_run_id: RUN,
  hive_id: HIVE,
  batches: [
    batch({
      disposition: "VALID_WITH_REJECTIONS",
      rejection_reason_codes: ["ENUM_INVALID"],
      accepted_facts: [
        {
          record_type_id: "service",
          record_local_id: "r2",
          parent_record_local_id: null,
          segment_index: 0,
          fact_id: "service.service_type",
          status: "OBSERVED",
          value: "related services",
          evidence: [{ page_number: 2, exact_quote: "related services" }],
        },
        {
          record_type_id: "document_header",
          record_local_id: "r1",
          parent_record_local_id: null,
          segment_index: 0,
          fact_id: "document_header.effective_end",
          status: "NOT_FOUND",
          evidence: [],
        },
      ],
    }),
    batch({
      batch_id: "b2",
      source_document_id: "doc-2",
      filename: "03_parent_evaluation_consent.pdf",
      page_start: 1,
      page_end: 1,
      status: "FAILED",
      disposition: "UNUSABLE",
      classification_status: null,
      primary_document_type_id: null,
      counts: null,
      error_code: "MODEL_OUTPUT_INVALID",
      error_reason: "output_not_json",
      accepted_facts: [],
    }),
  ],
};

describe("groupExtractionByDocument", () => {
  it("merges page windows per document and keeps the worst status", () => {
    const docs = groupExtractionByDocument({
      ...VIEW,
      batches: [
        batch({ page_start: 1, page_end: 2, is_partial: true }),
        batch({ batch_id: "b3", page_start: 2, page_end: 3, is_partial: true, disposition: "VALID_WITH_REJECTIONS", rejection_reason_codes: ["QUOTE_NOT_IN_PAGE"] }),
      ],
    });
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      pages: "pp. 1–3",
      status: "extracted_with_rejections",
      rejection_reason_codes: ["QUOTE_NOT_IN_PAGE"],
    });
  });
});

describe("ExtractedFactsPanel", () => {
  let mount: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    mount = document.createElement("div");
    document.body.append(mount);
    root = createRoot(mount);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });

  async function render() {
    await act(async () => {
      root.render(<ExtractedFactsPanel hiveId={HIVE} studyRunId={RUN} />);
    });
  }

  it("shows each document's type, facts, page citations and validation status from the API", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(VIEW), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await render();

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/hives/${HIVE}/study-runs/${RUN}/extraction`,
      expect.objectContaining({ credentials: "same-origin" }),
    );
    const docs = mount.querySelectorAll('[data-testid="extracted-document"]');
    expect(docs).toHaveLength(2);
    expect(docs[0]!.querySelector('[data-testid="document-type"]')!.textContent).toBe("iep.plan");
    expect(docs[0]!.querySelector('[data-testid="validation-status"]')!.textContent).toBe(
      "Extracted, some candidates rejected",
    );
    expect(docs[0]!.querySelector('[data-testid="rejection-codes"]')!.textContent).toContain("ENUM_INVALID");
    expect(docs[0]!.querySelectorAll('[data-testid="extracted-fact"]')).toHaveLength(2);
    expect(docs[0]!.querySelector('[data-testid="fact-citation"]')!.textContent).toBe(
      "p. 2: “related services”",
    );
    expect(docs[1]!.getAttribute("data-status")).toBe("failed");
    expect(docs[1]!.textContent).toContain("output_not_json");
    expect(mount.textContent).toContain("unverified");
  });

  it("renders nothing when the run has no Pack extraction", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ...VIEW, batches: [] }), { status: 200 })),
    );
    await render();
    expect(mount.innerHTML).toBe("");
  });

  it("shows a safe recovery state and retries on request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            contract_version: "error-envelope@1",
            error_code: "DEPENDENCY_UNAVAILABLE",
            category: "dependency",
            retryable: true,
            message_safe: "Extracted facts could not be loaded.",
            correlation_id: "c1",
          }),
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(VIEW), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await render();
    expect(mount.querySelector('[data-testid="extracted-facts-error"]')!.textContent).toContain(
      "Extracted facts could not be loaded.",
    );
    await act(async () => {
      mount.querySelector("button")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(mount.querySelectorAll('[data-testid="extracted-document"]')).toHaveLength(2);
  });
});
