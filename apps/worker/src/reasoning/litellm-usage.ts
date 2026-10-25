/** Provider-side prompt caching is not verified in this repository (gateway P5.3). */
export const PACK_EXTRACTION_LITELLM_PREFIX_CACHING_VERIFIED = false as const;

export type PackExtractionCacheStatus = "HIT" | "PARTIAL" | "MISS" | "NOT_REPORTED";

export type LiteLlmTokenUsage = {
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens: number | null;
  cache_write_tokens: number | null;
  cache_status: PackExtractionCacheStatus;
};

function readNonNegativeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    return null;
  }
  return value;
}

function readUsageRecord(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const usage = (data as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") {
    return null;
  }
  return usage as Record<string, unknown>;
}

function deriveCacheStatus(
  cachedRead: number | null,
  cacheWrite: number | null,
): PackExtractionCacheStatus {
  if (cachedRead === null && cacheWrite === null) {
    return "NOT_REPORTED";
  }
  const read = cachedRead ?? 0;
  const write = cacheWrite ?? 0;
  if (read > 0 && write > 0) {
    return "PARTIAL";
  }
  if (read > 0) {
    return "HIT";
  }
  if (write > 0) {
    return "MISS";
  }
  return "NOT_REPORTED";
}

/**
 * Best-effort parse of OpenAI-compatible usage + common LiteLLM provider passthrough fields.
 * Missing fields yield `cache_status = NOT_REPORTED` (correctness does not depend on cache hits).
 */
export function parseLiteLlmTokenUsage(data: unknown): LiteLlmTokenUsage {
  const usage = readUsageRecord(data);
  if (!usage) {
    return {
      input_tokens: null,
      output_tokens: null,
      cached_input_tokens: null,
      cache_write_tokens: null,
      cache_status: "NOT_REPORTED",
    };
  }

  const input_tokens = readNonNegativeInt(usage.prompt_tokens);
  const output_tokens = readNonNegativeInt(usage.completion_tokens);

  let cached_input_tokens =
    readNonNegativeInt(usage.cache_read_input_tokens) ??
    readNonNegativeInt(usage.cached_tokens);

  const details = usage.prompt_tokens_details;
  if (cached_input_tokens === null && details && typeof details === "object") {
    cached_input_tokens = readNonNegativeInt(
      (details as { cached_tokens?: unknown }).cached_tokens,
    );
  }

  const cache_write_tokens =
    readNonNegativeInt(usage.cache_creation_input_tokens) ??
    readNonNegativeInt(usage.cache_write_input_tokens);

  return {
    input_tokens,
    output_tokens,
    cached_input_tokens,
    cache_write_tokens,
    cache_status: deriveCacheStatus(cached_input_tokens, cache_write_tokens),
  };
}

export function readLiteLlmProviderModel(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const model = (data as { model?: unknown }).model;
  return typeof model === "string" && model.trim() ? model.trim() : null;
}

export function readLiteLlmGatewayRequestId(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const id = (data as { id?: unknown }).id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}
