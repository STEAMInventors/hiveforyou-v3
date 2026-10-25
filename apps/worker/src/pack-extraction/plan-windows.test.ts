import { describe, expect, it } from "vitest";

import { parsePackExtractionInputV1 } from "@hiveforyou/contracts/pack-extraction/v1";

import { PlanningError } from "../plan/errors.js";
import { readResponse, sourceRow } from "./pack-extraction.fixture.js";
import {
  EMPTY_PAGE_PLACEHOLDER,
  planPackExtractionWindows,
  readPackExtractionBudget,
} from "./plan-windows.js";

const PROMPT_DIGEST = `sha256:${"a".repeat(64)}`;

function read(pageTexts: string[]) {
  const doc = {
    source_document_id: "doc-1",
    filename: "doc.pdf",
    expected_document_type_id: "iep.plan",
    pages: pageTexts.map((text, i) => ({ page_number: i + 1, text })),
  };
  return readResponse(doc, sourceRow(doc, "hive-1"));
}

describe("readPackExtractionBudget", () => {
  it("uses conservative defaults and ignores invalid overrides", () => {
    expect(readPackExtractionBudget({})).toEqual({ maxContextTokens: 128_000, outputReserveTokens: 8_192 });
    expect(
      readPackExtractionBudget({
        WORKER_P2_EXTRACTION_MAX_CONTEXT_TOKENS: "64000",
        WORKER_P2_EXTRACTION_OUTPUT_RESERVE_TOKENS: "-5",
      }),
    ).toEqual({ maxContextTokens: 64_000, outputReserveTokens: 8_192 });
  });
});

describe("planPackExtractionWindows", () => {
  it("uses Mode A for a document that fits, with a valid pack-extraction-input@1 message", () => {
    const windows = planPackExtractionWindows({
      promptDigest: PROMPT_DIGEST,
      promptTokens: 1000,
      read: read(["Page one text", ""]),
      budget: { maxContextTokens: 128_000, outputReserveTokens: 8_192 },
    });
    expect(windows).toHaveLength(1);
    expect(windows[0]).toMatchObject({ mode: "A", page_start: 1, page_end: 2, is_partial: false });
    const message = JSON.parse(windows[0]!.userMessageJson);
    expect(parsePackExtractionInputV1(message).ok).toBe(true);
    expect(message.source_ref.source_ref_id).toBe("src-1");
    expect(message.pages[1].text).toBe(EMPTY_PAGE_PLACEHOLDER);
    expect(windows[0]!.userMessageJson).not.toContain("doc-1");
  });

  it("splits into overlapping Mode B windows when the whole document does not fit", () => {
    const page = "x".repeat(3000);
    const windows = planPackExtractionWindows({
      promptDigest: PROMPT_DIGEST,
      promptTokens: 1000,
      read: read([page, page, page, page, page]),
      budget: { maxContextTokens: 1000 + 512 + 2600, outputReserveTokens: 512 },
    });
    expect(windows.length).toBeGreaterThan(1);
    expect(windows.every((w) => w.mode === "B" && w.is_partial)).toBe(true);
    expect(windows[0]!.page_start).toBe(1);
    expect(windows.at(-1)!.page_end).toBe(5);
    for (let i = 1; i < windows.length; i += 1) {
      expect(windows[i]!.page_start).toBeLessThanOrEqual(windows[i - 1]!.page_end + 1);
      expect(windows[i]!.page_start).toBeGreaterThan(windows[i - 1]!.page_start);
    }
    for (const window of windows) {
      expect(window.estimatedInputTokens).toBeLessThanOrEqual(1000 + 2600);
    }
  });

  it("fails closed when the prompt prefix leaves no room (Mode C not implemented)", () => {
    expect(() =>
      planPackExtractionWindows({
        promptDigest: PROMPT_DIGEST,
        promptTokens: 200_000,
        read: read(["text"]),
        budget: { maxContextTokens: 128_000, outputReserveTokens: 8_192 },
      }),
    ).toThrowError(
      expect.objectContaining({
        errorCode: "EXTRACTION_FAILED",
        diagnostics: expect.objectContaining({ reason: "context_budget_exceeded", mode: "C_required" }),
      }),
    );
  });

  it("fails closed when a single page cannot fit", () => {
    try {
      planPackExtractionWindows({
        promptDigest: PROMPT_DIGEST,
        promptTokens: 1000,
        read: read(["short", "y".repeat(30_000)]),
        budget: { maxContextTokens: 1000 + 512 + 2000, outputReserveTokens: 512 },
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PlanningError);
      expect((error as PlanningError).diagnostics).toMatchObject({ reason: "context_budget_exceeded", mode: "B" });
    }
  });
});
