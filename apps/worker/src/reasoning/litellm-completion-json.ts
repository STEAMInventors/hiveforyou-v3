export type LiteLlmJsonExtractFailureReason =
  | "missing_message_content"
  | "message_content_invalid_json"
  | "message_content_not_object"
  | "tool_call_arguments_invalid_json"
  | "tool_call_arguments_not_object";

export type LiteLlmJsonExtractResult =
  | { ok: true; parsed: unknown }
  | { ok: false; reason: LiteLlmJsonExtractFailureReason };

type ContentBlock = { type?: unknown; text?: unknown };

function parseJsonText(text: string): LiteLlmJsonExtractResult {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") {
      return { ok: false, reason: "message_content_not_object" };
    }
    return { ok: true, parsed };
  } catch {
    return { ok: false, reason: "message_content_invalid_json" };
  }
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
    if (!parsed || typeof parsed !== "object") {
      return { ok: false, reason: "tool_call_arguments_not_object" };
    }
    return { ok: true, parsed };
  } catch {
    return { ok: false, reason: "tool_call_arguments_invalid_json" };
  }
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
