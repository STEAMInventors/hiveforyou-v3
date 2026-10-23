export type LiteLlmJsonExtractFailureReason =
  | "missing_message_content"
  | "message_content_invalid_json"
  | "message_content_not_object"
  | "message_content_ambiguous_json"
  | "tool_call_arguments_invalid_json"
  | "tool_call_arguments_not_object";

export type LiteLlmJsonExtractResult =
  | { ok: true; parsed: unknown }
  | { ok: false; reason: LiteLlmJsonExtractFailureReason };

type ContentBlock = { type?: unknown; text?: unknown };

function isJsonObjectValue(parsed: unknown): boolean {
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
}

function successObject(parsed: unknown): LiteLlmJsonExtractResult {
  if (!isJsonObjectValue(parsed)) {
    return { ok: false, reason: "message_content_not_object" };
  }
  return { ok: true, parsed };
}

function tryParseJsonObjectLiteral(text: string): LiteLlmJsonExtractResult | null {
  try {
    const parsed = JSON.parse(text);
    if (!isJsonObjectValue(parsed)) {
      return { ok: false, reason: "message_content_not_object" };
    }
    return { ok: true, parsed };
  } catch {
    return null;
  }
}

const MARKDOWN_FENCE_PATTERN = /```(?:json)?\s*([\s\S]*?)\s*```/gi;

function parseFromMarkdownFences(text: string): LiteLlmJsonExtractResult | null {
  const matches = [...text.matchAll(MARKDOWN_FENCE_PATTERN)];
  if (matches.length === 0) {
    return null;
  }
  if (matches.length > 1) {
    return { ok: false, reason: "message_content_ambiguous_json" };
  }
  const inner = matches[0][1]?.trim() ?? "";
  if (!inner) {
    return { ok: false, reason: "message_content_invalid_json" };
  }
  const parsed = tryParseJsonObjectLiteral(inner);
  if (!parsed) {
    return { ok: false, reason: "message_content_invalid_json" };
  }
  return parsed;
}

function findMatchingCloseBrace(text: string, openIndex: number): number | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = openIndex; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === "\\") {
        escape = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return null;
}

type ObjectSpan = { start: number; end: number; parsed: unknown };

function findCompleteJsonObjectSpans(text: string): ObjectSpan[] {
  const spans: ObjectSpan[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") {
      continue;
    }
    const close = findMatchingCloseBrace(text, i);
    if (close === null) {
      continue;
    }
    const slice = text.slice(i, close + 1);
    const parsed = tryParseJsonObjectLiteral(slice);
    if (parsed?.ok) {
      spans.push({ start: i, end: close + 1, parsed: parsed.parsed });
    }
  }
  return spans;
}

function parseJsonText(text: string): LiteLlmJsonExtractResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, reason: "missing_message_content" };
  }

  const direct = tryParseJsonObjectLiteral(trimmed);
  if (direct) {
    return direct;
  }

  const fenced = parseFromMarkdownFences(trimmed);
  if (fenced) {
    return fenced;
  }

  const spans = findCompleteJsonObjectSpans(trimmed);
  if (spans.length > 1) {
    return { ok: false, reason: "message_content_ambiguous_json" };
  }
  if (spans.length === 1) {
    const { start, end, parsed } = spans[0];
    const before = trimmed.slice(0, start).trim();
    const after = trimmed.slice(end).trim();
    if (before || after) {
      return { ok: false, reason: "message_content_ambiguous_json" };
    }
    return successObject(parsed);
  }

  return { ok: false, reason: "message_content_invalid_json" };
}

function textFromContentBlocks(blocks: unknown[]): string | null {
  const parts: string[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const row = block as ContentBlock;
    if (row.type === "text" && typeof row.text === "string" && row.text.length > 0) {
      parts.push(row.text);
    }
  }
  if (parts.length === 0) {
    return null;
  }
  return parts.join("");
}

function parseMessageContent(content: unknown): LiteLlmJsonExtractResult | null {
  if (content === undefined || content === null) {
    return null;
  }
  if (typeof content === "string") {
    const trimmed = content.trim();
    if (!trimmed) {
      return { ok: false, reason: "missing_message_content" };
    }
    return parseJsonText(trimmed);
  }
  if (Array.isArray(content)) {
    const text = textFromContentBlocks(content);
    if (!text) {
      return { ok: false, reason: "missing_message_content" };
    }
    return parseJsonText(text.trim());
  }
  if (typeof content === "object") {
    return { ok: true, parsed: content };
  }
  return { ok: false, reason: "message_content_not_object" };
}

function parseToolCallArguments(toolCalls: unknown): LiteLlmJsonExtractResult | null {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    return null;
  }
  const first = toolCalls[0];
  if (!first || typeof first !== "object") {
    return null;
  }
  const fn = (first as { function?: unknown }).function;
  if (!fn || typeof fn !== "object") {
    return null;
  }
  const args = (fn as { arguments?: unknown }).arguments;
  if (typeof args !== "string" || !args.trim()) {
    return { ok: false, reason: "missing_message_content" };
  }
  try {
    const parsed = JSON.parse(args);
    if (!isJsonObjectValue(parsed)) {
      return { ok: false, reason: "tool_call_arguments_not_object" };
    }
    return { ok: true, parsed };
  } catch {
    return { ok: false, reason: "tool_call_arguments_invalid_json" };
  }
}

/** Character length of assistant message content (string or text blocks); no content returned. */
export function measureLiteLlmMessageContentLength(data: unknown): number | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") {
    return null;
  }
  const message = (choices[0] as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    return null;
  }
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") {
    return content.length;
  }
  if (Array.isArray(content)) {
    const text = textFromContentBlocks(content);
    return text ? text.length : null;
  }
  return null;
}

/** Parse structured JSON from an OpenAI-compatible LiteLLM chat completion body. */
export function extractJsonFromLiteLlmCompletion(data: unknown): LiteLlmJsonExtractResult {
  if (!data || typeof data !== "object") {
    return { ok: false, reason: "missing_message_content" };
  }
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") {
    return { ok: false, reason: "missing_message_content" };
  }
  const message = (choices[0] as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    return { ok: false, reason: "missing_message_content" };
  }
  const msg = message as { content?: unknown; tool_calls?: unknown };

  const fromContent = parseMessageContent(msg.content);
  if (fromContent?.ok) {
    return fromContent;
  }

  const fromTool = parseToolCallArguments(msg.tool_calls);
  if (fromTool?.ok) {
    return fromTool;
  }

  if (fromContent && !fromContent.ok) {
    return fromContent;
  }
  if (fromTool && !fromTool.ok) {
    return fromTool;
  }

  return { ok: false, reason: "missing_message_content" };
}
