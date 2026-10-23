import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorCode } from "@hiveforyou/contracts/errors/v1";

import { createLiteLlmReasoningClient } from "./litellm-client.js";

const configured = {
  LITELLM_BASE_URL: "http://litellm.test",
  LITELLM_API_KEY: "test-key",
  WORKER_P2_REASONING_LITELLM_ALIAS: "hive-p2-reasoning",
} as NodeJS.ProcessEnv;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LiteLLM reasoning client", () => {
  it("requires the existing P2 reasoning alias", () => {
    expect(() =>
      createLiteLlmReasoningClient({
        LITELLM_BASE_URL: "http://litellm.test",
        LITELLM_API_KEY: "test-key",
      } as NodeJS.ProcessEnv),
    ).toThrow(expect.objectContaining({ errorCode: ErrorCode.DEPENDENCY_UNAVAILABLE }));
  });

  it("sends the configured alias and correlation id", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.model).toBe("hive-p2-reasoning");
      expect(body.max_tokens).toBe(4096);
      expect(body.metadata).toEqual({
        correlation_id: "corr-9",
        task: "classify_document",
      });
      expect(String(init.headers && (init.headers as Record<string, string>).Authorization)).toContain(
        "test-key",
      );
      return {
        status: 200,
        ok: true,
        async json() {
          return { choices: [{ message: { content: JSON.stringify({ ok: true }) } }] };
        },
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = createLiteLlmReasoningClient(configured);
    const result = await client.completeJson({
      task: "classify_document",
      systemPrompt: "return json",
      userPayload: { filename: "a.pdf" },
      correlationId: "corr-9",
    });
    expect(result.alias).toBe("hive-p2-reasoning");
    expect(result.parsed).toEqual({ ok: true });
  });

  it("maps gateway failure without copying the response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 503,
        ok: false,
        async json() {
          return { error: "PATIENT SECRET TEXT" };
        },
      })),
    );
    const client = createLiteLlmReasoningClient(configured);
    await expect(
      client.completeJson({
        task: "generate_schema",
        systemPrompt: "return json",
        userPayload: { intent_text: "rent" },
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.MODEL_UNAVAILABLE,
      message: "Reasoning gateway returned an error.",
    });
  });

  it("maps invalid model JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        ok: true,
        async json() {
          return { choices: [{ message: { content: "not-json" } }] };
        },
      })),
    );
    const client = createLiteLlmReasoningClient(configured);
    await expect(
      client.completeJson({
        task: "generate_schema",
        systemPrompt: "return json",
        userPayload: {},
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.MODEL_OUTPUT_INVALID,
      diagnostics: { reason: "message_content_invalid_json" },
    });
  });

  it("includes allowlisted finish_reason and content length on JSON parse failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        ok: true,
        async json() {
          return {
            choices: [
              {
                finish_reason: "length",
                message: { content: '{"truncated":' },
              },
            ],
          };
        },
      })),
    );
    const client = createLiteLlmReasoningClient(configured);
    await expect(
      client.completeJson({
        task: "plan_questions_decompose",
        systemPrompt: "return json",
        userPayload: {},
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.MODEL_OUTPUT_INVALID,
      diagnostics: {
        reason: "message_content_invalid_json",
        finish_reason: "length",
        message_content_length: 13,
      },
    });
  });

  it("omits non-allowlisted finish_reason from parse failure diagnostics", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        ok: true,
        async json() {
          return {
            choices: [
              {
                finish_reason: "model_custom_stop",
                message: { content: "not-json" },
              },
            ],
          };
        },
      })),
    );
    const client = createLiteLlmReasoningClient(configured);
    try {
      await client.completeJson({
        task: "generate_schema",
        systemPrompt: "return json",
        userPayload: {},
      });
      expect.fail("expected PlanningError");
    } catch (error) {
      expect(error).toMatchObject({
        errorCode: ErrorCode.MODEL_OUTPUT_INVALID,
        diagnostics: {
          reason: "message_content_invalid_json",
          message_content_length: 8,
        },
      });
      expect(
        (error as { diagnostics: Record<string, unknown> }).diagnostics.finish_reason,
      ).toBeUndefined();
    }
  });

  it("accepts JSON delivered via tool_calls when content is null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        ok: true,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      function: {
                        arguments: JSON.stringify({ atomic_questions: [] }),
                      },
                    },
                  ],
                },
              },
            ],
          };
        },
      })),
    );
    const client = createLiteLlmReasoningClient(configured);
    const result = await client.completeJson({
      task: "plan_questions_decompose",
      systemPrompt: "return json",
      userPayload: { intent_text: "test" },
    });
    expect(result.parsed).toEqual({ atomic_questions: [] });
  });

  it("maps a non-JSON gateway body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        ok: true,
        async json() {
          throw new SyntaxError("Unexpected token");
        },
      })),
    );
    const client = createLiteLlmReasoningClient(configured);
    await expect(
      client.completeJson({
        task: "generate_schema",
        systemPrompt: "return json",
        userPayload: {},
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.MODEL_OUTPUT_INVALID,
      diagnostics: { reason: "gateway_response_not_json" },
    });
  });

  it("maps timeouts without retrying", async () => {
    const fetchMock = vi.fn(async () => {
      const error = new Error("timed out");
      error.name = "TimeoutError";
      throw error;
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = createLiteLlmReasoningClient(configured);
    await expect(
      client.completeJson({
        task: "classify_document",
        systemPrompt: "return json",
        userPayload: {},
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.MODEL_TIMEOUT });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
