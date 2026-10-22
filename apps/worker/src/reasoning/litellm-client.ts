import { ErrorCode } from "@hiveforyou/contracts/errors/v1";

import { PlanningError } from "../plan/errors.js";
import type { ReasoningJsonClient, ReasoningJsonRequest } from "./types.js";

const REQUEST_TIMEOUT_MS = 90_000;

function gatewayFailure(
  errorCode: typeof ErrorCode.MODEL_UNAVAILABLE | typeof ErrorCode.MODEL_TIMEOUT | typeof ErrorCode.MODEL_OUTPUT_INVALID | typeof ErrorCode.DEPENDENCY_UNAVAILABLE,
  message: string,
  diagnostics: Record<string, string | number | boolean | null>,
): PlanningError {
  return new PlanningError(errorCode, message, diagnostics);
}

function isTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

/**
 * One P2.2 reasoning alias (`WORKER_P2_REASONING_LITELLM_ALIAS`) via the LiteLLM gateway.
 * No retries: Inngest owns retry. Response bodies are not copied into errors or logs.
 */
export function createLiteLlmReasoningClient(
  env: NodeJS.ProcessEnv = process.env,
): ReasoningJsonClient {
  const base = env.LITELLM_BASE_URL?.trim() ?? "";
  const apiKey = env.LITELLM_API_KEY?.trim() ?? "";
  const alias = env.WORKER_P2_REASONING_LITELLM_ALIAS?.trim() ?? "";
  if (!base || !apiKey || !alias) {
    throw gatewayFailure(
      ErrorCode.DEPENDENCY_UNAVAILABLE,
      "P2 reasoning alias is not configured.",
      { reason: "alias_not_configured" },
    );
  }

  return {
    async completeJson(request: ReasoningJsonRequest) {
      const started = Date.now();
      try {
        const response = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: alias,
            response_format: { type: "json_object" },
            metadata: {
              correlation_id: request.correlationId ?? null,
              task: request.task,
            },
            messages: [
              { role: "system", content: request.systemPrompt },
              { role: "user", content: JSON.stringify(request.userPayload) },
            ],
          }),
        });
        const durationMs = Date.now() - started;
        if (response.status === 429 || response.status >= 500) {
          throw gatewayFailure(
            ErrorCode.MODEL_UNAVAILABLE,
            "Reasoning gateway returned an error.",
            { reason: "gateway_status", status: response.status, alias },
          );
        }
        if (!response.ok) {
          throw gatewayFailure(
            ErrorCode.MODEL_OUTPUT_INVALID,
            "Reasoning gateway rejected the request.",
            { reason: "gateway_rejected", status: response.status, alias },
          );
        }
        let data: unknown;
        try {
          data = await response.json();
        } catch {
          throw gatewayFailure(
            ErrorCode.MODEL_OUTPUT_INVALID,
            "Model returned invalid JSON.",
            { reason: "invalid_json", alias },
          );
        }
        const content = readContent(data);
        let parsed: unknown;
        try {
          parsed = typeof content === "string" ? JSON.parse(content) : content;
        } catch {
          throw gatewayFailure(
            ErrorCode.MODEL_OUTPUT_INVALID,
            "Model returned invalid JSON.",
            { reason: "invalid_json", alias },
          );
        }
        if (!parsed || typeof parsed !== "object") {
          throw gatewayFailure(
            ErrorCode.MODEL_OUTPUT_INVALID,
            "Model returned invalid JSON.",
            { reason: "invalid_json", alias },
          );
        }
        return { parsed, alias, durationMs };
      } catch (error) {
        if (error instanceof PlanningError) {
          throw error;
        }
        const durationMs = Date.now() - started;
        if (isTimeout(error)) {
          throw gatewayFailure(
            ErrorCode.MODEL_TIMEOUT,
            "Reasoning model timed out.",
            { reason: "model_timeout", alias, duration_ms: durationMs },
          );
        }
        throw gatewayFailure(
          ErrorCode.MODEL_UNAVAILABLE,
          "Reasoning gateway request failed.",
          { reason: "gateway_request_failed", alias, duration_ms: durationMs },
        );
      }
    },
  };
}

function readContent(data: unknown): unknown {
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") {
    return undefined;
  }
  const message = (choices[0] as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    return undefined;
  }
  return (message as { content?: unknown }).content;
}
