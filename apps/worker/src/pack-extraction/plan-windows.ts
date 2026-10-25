import { ErrorCode } from "@hiveforyou/contracts/errors/v1";
import type { ReaderReadDocumentResponseV1 } from "@hiveforyou/contracts/reader/v1";

import { PlanningError } from "../plan/errors.js";
import {
  buildPackExtractionUserMessage,
  serializePackExtractionUserMessage,
} from "./build-user-message.js";
import { estimatePromptTokensFromBytes } from "./token-estimate.js";

/** One document per call, so a fixed label keeps identifiers out of the user message. */
export const PACK_EXTRACTION_SOURCE_REF_ID = "src-1";

/** Model-facing stand-in for a page with no text; never matches a quote (validator uses Reader text). */
export const EMPTY_PAGE_PLACEHOLDER = "[no extractable text on this page]";

const DEFAULT_MAX_CONTEXT_TOKENS = 128_000;
const DEFAULT_OUTPUT_RESERVE_TOKENS = 8_192;

/** Per-alias limits are **[UNVERIFIED]** against the deployed gateway; defaults are conservative. */
export type PackExtractionBudget = {
  maxContextTokens: number;
  outputReserveTokens: number;
};

export type PackExtractionWindow = {
  mode: "A" | "B";
  page_start: number;
  page_end: number;
  is_partial: boolean;
  userMessageJson: string;
  estimatedInputTokens: number;
};

function positiveIntEnv(raw: string | undefined, fallback: number): number {
  const parsed = raw ? Number.parseInt(raw.trim(), 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function readPackExtractionBudget(env: NodeJS.ProcessEnv = process.env): PackExtractionBudget {
  return {
    maxContextTokens: positiveIntEnv(
      env.WORKER_P2_EXTRACTION_MAX_CONTEXT_TOKENS,
      DEFAULT_MAX_CONTEXT_TOKENS,
    ),
    outputReserveTokens: positiveIntEnv(
      env.WORKER_P2_EXTRACTION_OUTPUT_RESERVE_TOKENS,
      DEFAULT_OUTPUT_RESERVE_TOKENS,
    ),
  };
}

export function mimeFamily(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized === "application/pdf") return "pdf";
  if (normalized.startsWith("image/")) return "image";
  if (normalized.includes("wordprocessingml")) return "docx";
  return "other";
}

function budgetExceeded(diagnostics: Record<string, string | number | boolean | null>): PlanningError {
  return new PlanningError(
    ErrorCode.EXTRACTION_FAILED,
    "This document is too large to extract within the configured context budget.",
    { reason: "context_budget_exceeded", ...diagnostics },
  );
}

/**
 * Mode A (whole document) when prefix + document + output reserve fit; otherwise Mode B
 * contiguous page windows with a one-page overlap. Mode C (pack partitions) is not
 * implemented: a prefix that cannot fit fails closed before any model call.
 */
export function planPackExtractionWindows(input: {
  promptDigest: string;
  promptTokens: number;
  read: ReaderReadDocumentResponseV1;
  budget: PackExtractionBudget;
}): PackExtractionWindow[] {
  const { read, budget } = input;
  const pageCount = read.page_count;
  const available = budget.maxContextTokens - budget.outputReserveTokens - input.promptTokens;
  if (pageCount < 1) {
    throw budgetExceeded({ mode: "none", page_count: pageCount });
  }
  if (available <= 0) {
    throw budgetExceeded({ mode: "C_required", prompt_tokens: input.promptTokens });
  }

  const byNumber = new Map(read.pages.map((page) => [page.page_number, page]));
  const family = mimeFamily(read.source.mime_type);

  const build = (start: number, end: number, isPartial: boolean) => {
    const pages: Array<{ page_number: number; text: string }> = [];
    const meta: Array<{ page_number: number; extraction_method: string; quality: string }> = [];
    for (let n = start; n <= end; n += 1) {
      const page = byNumber.get(n);
      const text = page?.text ?? "";
      pages.push({ page_number: n, text: text.trim().length > 0 ? text : EMPTY_PAGE_PLACEHOLDER });
      meta.push({
        page_number: n,
        extraction_method: page?.extraction_method ?? "missing",
        quality: page?.quality.identity_text_sufficient ? "sufficient" : "limited",
      });
    }
    const json = serializePackExtractionUserMessage(
      buildPackExtractionUserMessage({
        prompt_digest: input.promptDigest,
        source_ref_id: PACK_EXTRACTION_SOURCE_REF_ID,
        source_sha256: read.source.sha256,
        read_fingerprint: read.read_fingerprint,
        mime_family: family,
        page_count: pageCount,
        window: { page_start: start, page_end: end, is_partial: isPartial },
        pages_meta: meta,
        pages,
      }),
    );
    return { json, tokens: estimatePromptTokensFromBytes(Buffer.byteLength(json, "utf8")) };
  };

  const whole = build(1, pageCount, false);
  if (whole.tokens <= available) {
    return [
      {
        mode: "A",
        page_start: 1,
        page_end: pageCount,
        is_partial: false,
        userMessageJson: whole.json,
        estimatedInputTokens: input.promptTokens + whole.tokens,
      },
    ];
  }

  const windows: PackExtractionWindow[] = [];
  let start = 1;
  for (;;) {
    let best = build(start, start, true);
    if (best.tokens > available) {
      throw budgetExceeded({ mode: "B", page_number: start });
    }
    let end = start;
    while (end < pageCount) {
      const next = build(start, end + 1, true);
      if (next.tokens > available) {
        break;
      }
      best = next;
      end += 1;
    }
    windows.push({
      mode: "B",
      page_start: start,
      page_end: end,
      is_partial: true,
      userMessageJson: best.json,
      estimatedInputTokens: input.promptTokens + best.tokens,
    });
    if (end >= pageCount) {
      return windows;
    }
    start = end > start ? end : end + 1;
  }
}
