import { describe, expect, it } from "vitest";

import {
  extractJsonFromLiteLlmCompletion,
  measureLiteLlmMessageContentLength,
} from "./litellm-completion-json.js";

describe("extractJsonFromLiteLlmCompletion", () => {
  it("parses string message content", () => {
    const result = extractJsonFromLiteLlmCompletion({
      choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
    });
    expect(result).toEqual({ ok: true, parsed: { ok: true } });
  });

  it("parses JSON enclosed in a markdown json fence", () => {
    const payload = { atomic_questions: [{ id: "q1" }] };
    const result = extractJsonFromLiteLlmCompletion({
      choices: [
        {
          message: {
            content: "```json\n" + JSON.stringify(payload) + "\n```",
          },
        },
      ],
    });
    expect(result).toEqual({ ok: true, parsed: payload });
  });

  it("parses a fenced object when brief prose appears outside the fence", () => {
    const payload = { ok: true };
    const result = extractJsonFromLiteLlmCompletion({
      choices: [
        {
          message: {
            content: "Here is the plan:\n```json\n" + JSON.stringify(payload) + "\n```\nThanks.",
          },
        },
      ],
    });
    expect(result).toEqual({ ok: true, parsed: payload });
  });

  it("parses Anthropic-style text blocks that split one JSON object", () => {
    const json = JSON.stringify({ atomic_questions: [] });
    const mid = Math.floor(json.length / 2);
    const result = extractJsonFromLiteLlmCompletion({
      choices: [
        {
          message: {
            content: [
              { type: "text", text: json.slice(0, mid) },
              { type: "text", text: json.slice(mid) },
            ],
          },
        },
      ],
    });
    expect(result).toEqual({ ok: true, parsed: { atomic_questions: [] } });
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

  it("classifies truncated JSON objects", () => {
    expect(
      extractJsonFromLiteLlmCompletion({
        choices: [{ message: { content: '{"atomic_questions": [' } }],
      }),
    ).toEqual({ ok: false, reason: "message_content_invalid_json" });
  });

  it("classifies non-object JSON scalars", () => {
    expect(
      extractJsonFromLiteLlmCompletion({
        choices: [{ message: { content: '"just-a-string"' } }],
      }),
    ).toEqual({ ok: false, reason: "message_content_not_object" });
  });

  it("rejects root-level JSON arrays in bare message content", () => {
    expect(
      extractJsonFromLiteLlmCompletion({
        choices: [{ message: { content: JSON.stringify([{ id: "q1" }]) } }],
      }),
    ).toEqual({ ok: false, reason: "message_content_not_object" });
  });

  it("rejects root-level JSON arrays inside a markdown json fence", () => {
    expect(
      extractJsonFromLiteLlmCompletion({
        choices: [
          {
            message: {
              content: "```json\n" + JSON.stringify([{ id: "q1" }]) + "\n```",
            },
          },
        ],
      }),
    ).toEqual({ ok: false, reason: "message_content_not_object" });
  });

  it("rejects root-level JSON arrays in tool-call arguments", () => {
    expect(
      extractJsonFromLiteLlmCompletion({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [{ function: { arguments: JSON.stringify([{ id: "a1" }]) } }],
            },
          },
        ],
      }),
    ).toEqual({ ok: false, reason: "tool_call_arguments_not_object" });
  });

  it("classifies multiple JSON objects in one message", () => {
    expect(
      extractJsonFromLiteLlmCompletion({
        choices: [
          {
            message: {
              content: JSON.stringify({ a: 1 }) + "\n" + JSON.stringify({ b: 2 }),
            },
          },
        ],
      }),
    ).toEqual({ ok: false, reason: "message_content_ambiguous_json" });
  });

  it("classifies prose plus bare JSON without fences", () => {
    expect(
      extractJsonFromLiteLlmCompletion({
        choices: [
          {
            message: {
              content: "Sure — " + JSON.stringify({ ok: true }),
            },
          },
        ],
      }),
    ).toEqual({ ok: false, reason: "message_content_ambiguous_json" });
  });

  it("classifies multiple markdown json fences", () => {
    expect(
      extractJsonFromLiteLlmCompletion({
        choices: [
          {
            message: {
              content:
                "```json\n" +
                JSON.stringify({ a: 1 }) +
                "\n```\n```json\n" +
                JSON.stringify({ b: 2 }) +
                "\n```",
            },
          },
        ],
      }),
    ).toEqual({ ok: false, reason: "message_content_ambiguous_json" });
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

describe("measureLiteLlmMessageContentLength", () => {
  it("measures string content length", () => {
    expect(
      measureLiteLlmMessageContentLength({
        choices: [{ message: { content: "abcdef" } }],
      }),
    ).toBe(6);
  });

  it("measures combined text block length", () => {
    expect(
      measureLiteLlmMessageContentLength({
        choices: [
          {
            message: {
              content: [
                { type: "text", text: "ab" },
                { type: "text", text: "cd" },
              ],
            },
          },
        ],
      }),
    ).toBe(4);
  });
});
