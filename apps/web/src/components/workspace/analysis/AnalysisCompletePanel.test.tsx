// @vitest-environment happy-dom

import type { PackExtractionOwnerViewV1 } from "@hiveforyou/contracts/pack-extraction/v1";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnalysisCompletePanel } from "@/components/workspace/analysis/AnalysisCompletePanel";
import type { DomainPackDisplayLabels } from "@/lib/domain-packs/public-metadata";

const HIVE = "11111111-1111-4111-8111-111111111111";
const RUN = "cda6fab3-ff62-4104-955f-feb2355f5351";

const LABELS: DomainPackDisplayLabels = {
  pack_id: "synthetic-receipts",
  pack_version: "0.1.0",
  document_types: [{ id: "receipt.store", label: "Store receipt" }],
  record_types: [
    { id: "store", label: "Store", group: "header" },
    { id: "line_item", label: "Item bought", group: "items" },
  ],
};
const lookup = (packId: string, version: string) =>
  packId === LABELS.pack_id && version === LABELS.pack_version ? LABELS : undefined;

const base = {
  page_start: 1,
  page_end: 1,
  is_partial: false,
  status: "SUCCEEDED" as const,
  disposition: "VALID" as const,
  classification_status: "CLASSIFIED" as const,
  primary_document_type_id: "receipt.store",
  pack_id: LABELS.pack_id,
  pack_version: LABELS.pack_version,
  counts: { records: 1, facts_accepted: 2, facts_rejected: 0, records_rejected: 0 },
  rejection_reason_codes: [],
  error_code: null,
  error_reason: null,
  reused: false,
};

const VIEW: PackExtractionOwnerViewV1 = {
  contract_version: "pack-extraction-owner-view@1",
  study_run_id: RUN,
  hive_id: HIVE,
  batches: [
    {
      ...base,
      batch_id: "b1",
      source_document_id: "doc-1",
      filename: "receipt-1.pdf",
      disposition: "VALID_WITH_REJECTIONS",
      counts: { records: 2, facts_accepted: 3, facts_rejected: 1, records_rejected: 0 },
      rejection_reason_codes: ["QUOTE_NOT_IN_PAGE"],
      accepted_facts: [
        {
          record_type_id: "store",
          record_local_id: "r1",
          parent_record_local_id: null,
          segment_index: 0,
          fact_id: "store.name",
          status: "OBSERVED",
          value: "Corner Market",
          evidence: [{ page_number: 1, exact_quote: "CORNER MARKET" }],
        },
        {
          record_type_id: "line_item",
          record_local_id: "r2",
          parent_record_local_id: null,
          segment_index: 0,
          fact_id: "line_item.price",
          status: "UNCERTAIN",
          value: 2.5,
          reason_code: "smudged",
          evidence: [{ page_number: 1, exact_quote: "2.5?" }],
        },
        {
          record_type_id: "line_item",
          record_local_id: "r2",
          parent_record_local_id: null,
          segment_index: 0,
          fact_id: "line_item.discount",
          status: "NOT_FOUND",
          evidence: [],
        },
      ],
    },
    {
      ...base,
      batch_id: "b2",
      source_document_id: "doc-2",
      filename: "broken.pdf",
      status: "FAILED",
      disposition: "UNUSABLE",
      classification_status: null,
      primary_document_type_id: null,
      counts: null,
      error_code: "MODEL_OUTPUT_INVALID",
      error_reason: "output_not_json",
      accepted_facts: [],
    },
  ],
};

describe("AnalysisCompletePanel", () => {
  let mount: HTMLDivElement;
  let root: Root;
  const onGoToDocuments = vi.fn();

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    document.body.innerHTML = "";
    mount = document.createElement("div");
    document.body.append(mount);
    root = createRoot(mount);
    onGoToDocuments.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });

  async function render(questions = { heading: "Your question", items: ["What did I buy?"] }) {
    await act(async () => {
      root.render(
        <AnalysisCompletePanel
          hiveId={HIVE}
          studyRunId={RUN}
          questions={questions}
          onGoToDocuments={onGoToDocuments}
          lookupLabels={lookup}
        />,
      );
    });
  }

  function click(element: Element) {
    act(() => {
      element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  function buttonByText(text: string): HTMLButtonElement {
    const button = [...mount.querySelectorAll("button")].find((el) => el.textContent?.trim() === text);
    if (!button) throw new Error(`No button "${text}"`);
    return button;
  }

  it("renders the hero, counts, Pack topics and quotes from persisted extraction only", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(VIEW), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await render();

    expect(mount.querySelector("h2")!.textContent).toBe("We've read 1 of your 2 documents");
    expect(mount.querySelector('[data-testid="analysis-questions"]')!.textContent).toContain("What did I buy?");
    const summary = mount.querySelector('[data-testid="analysis-summary"]')!.textContent!;
    expect(summary).toContain("Documents read1 of 2");
    expect(summary).toContain("Uncertain1");
    expect(summary).toContain("Set aside1");
    expect(mount.textContent).toContain("None of these are verified findings yet.");

    const topics = [...mount.querySelectorAll('[data-testid="analysis-topic"] h3')].map((el) => el.textContent);
    expect(topics).toEqual(["Store", "Item bought"]);

    const uncertain = mount.querySelector('[data-testid="analysis-fact"][data-status="UNCERTAIN"]')!;
    expect(uncertain.textContent).toContain("Price: 2.5");
    expect(uncertain.textContent).toContain("Uncertain");
    expect(uncertain.querySelector('[data-testid="analysis-quote"]')).toBeNull();
    const toggle = uncertain.querySelector("button")!;
    click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const quote = uncertain.querySelector('[data-testid="analysis-quote"]')!;
    expect(toggle.getAttribute("aria-controls")).toBe(quote.id);
    expect(quote.textContent).toContain("“2.5?”");
    expect(quote.textContent).toContain("Uncertain · receipt-1.pdf · page 1");

    const notFound = mount.querySelector('[data-testid="analysis-not-found"]')!;
    expect(notFound.textContent).toContain("Item bought · Discount");
    expect(notFound.textContent).toContain("Not stated in: receipt-1.pdf");
    expect(mount.querySelector('[data-testid="set-aside-note"]')!.textContent).toContain(
      "the quoted words couldn't be found on the page",
    );
    expect(mount.querySelector('[data-testid="not-read-note"]')!.textContent).toContain("broken.pdf");
    expect(mount.textContent).not.toContain("output_not_json");
    expect(mount.textContent).not.toContain("MODEL_OUTPUT_INVALID");
  });

  it("offers no Canonical Study action, toast or request from the next-step card", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(VIEW), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await render();

    const card = mount.querySelector('[data-testid="canonical-study-next"]')!;
    expect(card.querySelector("h3")!.textContent).toBe("Next: Your Canonical Study");
    expect(card.textContent).toContain("isn't available yet");
    expect(card.querySelectorAll("button, a, [role='button'], [onclick]")).toHaveLength(0);
    expect(mount.textContent).not.toMatch(/Build my Canonical Study/i);

    click(card);
    click(buttonByText("By document"));
    click(buttonByText("By topic"));
    click(buttonByText("What the reading didn't find"));
    expect(document.querySelector('[role="status"]')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the not-found section from the hero", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(VIEW), { status: 200 })));
    await render();
    click(buttonByText("By document"));
    expect(mount.querySelector('[data-testid="analysis-not-found"]')).toBeNull();
    click(buttonByText("What the reading didn't find"));
    expect(document.activeElement?.id).toBe("analysis-not-found-title");
  });

  it("lists documents with Pack labels, flags and not-stated fields in the document view", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(VIEW), { status: 200 })));
    await render();
    const switchButton = buttonByText("By document");
    click(switchButton);
    expect(switchButton.getAttribute("aria-pressed")).toBe("true");

    const docs = mount.querySelectorAll('[data-testid="analysis-document"]');
    expect(docs).toHaveLength(2);
    expect(docs[0]!.textContent).toContain("Store receipt");
    expect(docs[0]!.textContent).toContain("1 uncertain");
    expect(docs[0]!.textContent).toContain("Some items set aside");
    expect(docs[1]!.getAttribute("data-read-state")).toBe("failed");
    expect(docs[1]!.textContent).toContain("Couldn't be read");
    expect(docs[1]!.querySelector("button")!.disabled).toBe(true);

    click(docs[0]!.querySelector("button")!);
    expect(docs[0]!.querySelectorAll('[data-testid="analysis-fact"]')).toHaveLength(2);
    expect(docs[0]!.querySelector('[data-testid="document-not-stated"]')!.textContent).toContain(
      "Item bought · Discount",
    );
  });

  it("shows an honest state for a run without Pack extraction", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ...VIEW, batches: [] }), { status: 200 })),
    );
    await render({ heading: "Your question", items: [] });
    expect(mount.querySelector("h2")!.textContent).toBe("We've read your documents");
    expect(mount.textContent).toContain("Itemized results for this analysis aren't shown here yet.");
    expect(mount.querySelector('[data-testid="analysis-topic"]')).toBeNull();
    expect(mount.querySelector('[data-testid="analysis-questions"]')).toBeNull();
    expect(mount.querySelector('[data-testid="canonical-study-next"]')).not.toBeNull();
  });

  it("shows a safe recovery state and retries on request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            contract_version: "error-envelope@1",
            error_code: "ACCESS_DENIED",
            category: "authorization",
            retryable: false,
            message_safe: "You do not have access to this run.",
            correlation_id: "c1",
          }),
          { status: 403 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(VIEW), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await render();
    expect(mount.querySelector('[role="alert"]')!.textContent).toContain("You do not have access to this run.");
    expect(mount.querySelector('[data-testid="analysis-topic"]')).toBeNull();
    await act(async () => {
      buttonByText("Try again").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(mount.querySelectorAll('[data-testid="analysis-topic"]')).toHaveLength(2);
  });

  it("returns to Documents from the back control", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(VIEW), { status: 200 })));
    await render();
    click(buttonByText("Back to Documents"));
    expect(onGoToDocuments).toHaveBeenCalledTimes(1);
  });
});
