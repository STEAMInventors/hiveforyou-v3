import { describe, expect, it } from "vitest";

import { extractJsonFromLiteLlmCompletion } from "./litellm-completion-json.js";

describe("extractJsonFromLiteLlmCompletion", () => {
  it("parses string message content", () => {
    const result = extractJsonFromLiteLlmCompletion({
      choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
    });
    expect(result).toEqual({ ok: true, parsed: { ok: true } });
  });

  it("parses Anthropic-style text blocks in message content", () => {
    const result = extractJsonFromLiteLlmCompletion({
      choices: [
        {
          message: {
            content: [{ type: "text", text: JSON.stringify({ atomic_questions: [] }) }],
          },
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("reads JSON from forced tool-call responses when content is null", () => {
    const result = extractJsonFromLiteLlmCompletion({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                function: {
                  arguments: JSON.stringify({ atomic_questions: [{ id: "a1" }] }),
                },
              },
            ],
          },
        },
      ],
    });
    expect(result).toEqual({
      ok: true,
      parsed: { atomic_questions: [{ id: "a1" }] },
    });
  });

  it("classifies missing assistant content", () => {
    expect(
      extractJsonFromLiteLlmCompletion({
        choices: [{ message: { content: null } }],
      }),
    ).toEqual({ ok: false, reason: "missing_message_content" });
  });

  it("classifies malformed message JSON", () => {
    expect(
      extractJsonFromLiteLlmCompletion({
        choices: [{ message: { content: "not-json" } }],
      }),
    ).toEqual({ ok: false, reason: "message_content_invalid_json" });
  });

  it("classifies malformed tool-call arguments", () => {
    expect(
      extractJsonFromLiteLlmCompletion({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [{ function: { arguments: "not-json" } }],
            },
          },
        ],
      }),
    ).toEqual({ ok: false, reason: "tool_call_arguments_invalid_json" });
  });
});
