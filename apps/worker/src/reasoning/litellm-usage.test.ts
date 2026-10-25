import { describe, expect, it } from "vitest";

import { parseLiteLlmTokenUsage } from "./litellm-usage.js";

describe("parseLiteLlmTokenUsage", () => {
  it("returns NOT_REPORTED when usage is absent", () => {
    expect(parseLiteLlmTokenUsage({})).toEqual({
      input_tokens: null,
      output_tokens: null,
      cached_input_tokens: null,
      cache_write_tokens: null,
      cache_status: "NOT_REPORTED",
    });
  });

  it("reads OpenAI-style cached_tokens from prompt_tokens_details", () => {
    const usage = parseLiteLlmTokenUsage({
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 200,
        prompt_tokens_details: { cached_tokens: 800 },
      },
    });
    expect(usage.cached_input_tokens).toBe(800);
    expect(usage.cache_status).toBe("HIT");
  });

  it("reads Anthropic-style cache creation and read tokens", () => {
    const miss = parseLiteLlmTokenUsage({
      usage: {
        prompt_tokens: 5000,
        completion_tokens: 100,
        cache_creation_input_tokens: 4000,
        cache_read_input_tokens: 0,
      },
    });
    expect(miss.cache_status).toBe("MISS");

    const hit = parseLiteLlmTokenUsage({
      usage: {
        prompt_tokens: 5000,
        completion_tokens: 100,
        cache_read_input_tokens: 4000,
      },
    });
    expect(hit.cache_status).toBe("HIT");

    const partial = parseLiteLlmTokenUsage({
      usage: {
        prompt_tokens: 5000,
        completion_tokens: 100,
        cache_creation_input_tokens: 500,
        cache_read_input_tokens: 3500,
      },
    });
    expect(partial.cache_status).toBe("PARTIAL");
  });
});
