import { ErrorCode } from "@hiveforyou/contracts/errors/v1";

import { PlanningError } from "../plan/errors.js";
import {
  extractJsonFromLiteLlmCompletion,
  measureLiteLlmMessageContentLength,
} from "./litellm-completion-json.js";
import {
  PACK_EXTRACTION_LITELLM_PREFIX_CACHING_VERIFIED,
  parseLiteLlmTokenUsage,
  readLiteLlmGatewayRequestId,
  readLiteLlmProviderModel,
  type LiteLlmTokenUsage,
} from "./litellm-usage.js";

const REQUEST_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

const ALLOWED_FINISH_REASONS = new Set([
  "stop",
  "length",
  "content_filter",
  "tool_calls",
  "function_call",
]);

export type ExtractPackDocumentLiteLlmRequest = {
  /** Complete compiled system prompt (never truncated). */
  systemPrompt: string;
  /** JCS-serialized `pack-extraction-input@1` JSON string. */
  userMessageJson: string;
  prompt_digest: string;
  correlationId?: string;
  studyRunId?: string;
  extractionBatchId?: string;
  maxOutputTokens?: number;
  /**
   * When true, attach Anthropic-style `cache_control` on the system text block only.
   * Default false — gateway-side injection is preferred and remains **[UNVERIFIED]** in repo.
   */
  attachSystemCacheControl?: boolean;
};

export type ExtractPackDocumentLiteLlmResult = {
  parsed: unknown;
  alias: string;
  durationMs: number;
  finishReason: string | null;
  usage: LiteLlmTokenUsage;
  providerModel: string | null;
  gatewayRequestId: string | null;
  prefixCachingVerified: typeof PACK_EXTRACTION_LITELLM_PREFIX_CACHING_VERIFIED;
};

export type PackExtractionLiteLlmClient = {
  extractPackDocument(
    request: ExtractPackDocumentLiteLlmRequest,
  ): Promise<ExtractPackDocumentLiteLlmResult>;
};

function allowlistedFinishReason(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") {
    return null;
  }
  const finishReason = (choices[0] as { finish_reason?: unknown }).finish_reason;
  if (typeof finishReason !== "string" || !ALLOWED_FINISH_REASONS.has(finishReason)) {
    return null;
  }
  return finishReason;
}

function modelOutputInvalidDiagnostics(
  data: unknown,
  reason: string,
  alias: string,
): Record<string, string | number | boolean | null> {
  const diagnostics: Record<string, string | number | boolean | null> = { reason, alias };
  const finishReason = allowlistedFinishReason(data);
  if (finishReason) {
    diagnostics.finish_reason = finishReason;
  }
  const contentLength = measureLiteLlmMessageContentLength(data);
  if (contentLength !== null) {
    diagnostics.message_content_length = contentLength;
  }
  return diagnostics;
}

function gatewayFailure(
  errorCode:
    | typeof ErrorCode.MODEL_UNAVAILABLE
    | typeof ErrorCode.MODEL_TIMEOUT
    | typeof ErrorCode.MODEL_OUTPUT_INVALID
    | typeof ErrorCode.DEPENDENCY_UNAVAILABLE,
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

type GatewayErrorHint = {
  errorType: string | null;
  errorCode: string | null;
};

async function readGatewayErrorHint(response: Response): Promise<GatewayErrorHint> {
  try {
    const body: unknown = await response.json();
    if (!body || typeof body !== "object") {
      return { errorType: null, errorCode: null };
    }
    const err = (body as { error?: unknown }).error;
    if (!err || typeof err !== "object") {
      return { errorType: null, errorCode: null };
    }
    const row = err as { type?: unknown; code?: unknown };
    const errorType = typeof row.type === "string" ? row.type : null;
    const errorCode = typeof row.code === "string" ? row.code : null;
    return { errorType, errorCode };
  } catch {
    return { errorType: null, errorCode: null };
  }
}

function isContextLimitRejection(status: number, hint: GatewayErrorHint): boolean {
  if (status !== 400 && status !== 413) {
    return false;
  }
  const combined = `${hint.errorType ?? ""} ${hint.errorCode ?? ""}`.toLowerCase();
  return /context|maximum|max_tokens|token|length_exceeded|too_large|payload/.test(combined);
}

function buildSystemMessageContent(
  systemPrompt: string,
  attachSystemCacheControl: boolean,
): Array<{ type: string; text: string; cache_control?: { type: string } }> {
  const block: { type: string; text: string; cache_control?: { type: string } } = {
    type: "text",
    text: systemPrompt,
  };
  if (attachSystemCacheControl) {
    block.cache_control = { type: "ephemeral" };
  }
  return [block];
}

function envAttachSystemCacheControl(env: NodeJS.ProcessEnv): boolean {
  const raw = env.WORKER_P2_EXTRACTION_ATTACH_CACHE_CONTROL?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/**
 * Pack extraction via `WORKER_P2_EXTRACTION_LITELLM_ALIAS` (separate from P2.2 reasoning).
 * System prompt is sent as a content block; user message is raw JSON text. No inline retries.
 */
export function createLiteLlmExtractionClient(
  env: NodeJS.ProcessEnv = process.env,
): PackExtractionLiteLlmClient {
  const base = env.LITELLM_BASE_URL?.trim() ?? "";
  const apiKey = env.LITELLM_API_KEY?.trim() ?? "";
  const alias = env.WORKER_P2_EXTRACTION_LITELLM_ALIAS?.trim() ?? "";
  if (!base || !apiKey || !alias) {
    throw gatewayFailure(
      ErrorCode.DEPENDENCY_UNAVAILABLE,
      "P2 pack extraction alias is not configured.",
      { reason: "alias_not_configured" },
    );
  }

  const defaultAttachCacheControl = envAttachSystemCacheControl(env);

  return {
    async extractPackDocument(request) {
      const started = Date.now();
      const attachSystemCacheControl =
        request.attachSystemCacheControl ?? defaultAttachCacheControl;
      const maxTokens = request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;

      const metadata: Record<string, string | null> = {
        correlation_id: request.correlationId ?? null,
        study_run_id: request.studyRunId ?? null,
        extraction_batch_id: request.extractionBatchId ?? null,
        task: "extract_pack_document",
        prompt_digest: request.prompt_digest,
      };

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
            max_tokens: maxTokens,
            response_format: { type: "json_object" },
            metadata,
            messages: [
              {
                role: "system",
                content: buildSystemMessageContent(
                  request.systemPrompt,
                  attachSystemCacheControl,
                ),
              },
              { role: "user", content: request.userMessageJson },
            ],
          }),
        });

        const durationMs = Date.now() - started;

        if (response.status === 429 || response.status >= 500) {
          throw gatewayFailure(
            ErrorCode.MODEL_UNAVAILABLE,
            "Extraction gateway returned an error.",
            { reason: "gateway_status", status: response.status, alias },
          );
        }

        if (!response.ok) {
          const hint = await readGatewayErrorHint(response);
          if (isContextLimitRejection(response.status, hint)) {
            throw gatewayFailure(
              ErrorCode.MODEL_OUTPUT_INVALID,
              "Extraction gateway rejected the request (context limit).",
              {
                reason: "context_limit_rejected",
                status: response.status,
                alias,
                error_type: hint.errorType,
                error_code: hint.errorCode,
              },
            );
          }
          throw gatewayFailure(
            ErrorCode.MODEL_OUTPUT_INVALID,
            "Extraction gateway rejected the request.",
            {
              reason: "gateway_rejected",
              status: response.status,
              alias,
              error_type: hint.errorType,
              error_code: hint.errorCode,
            },
          );
        }

        let data: unknown;
        try {
          data = await response.json();
        } catch {
          throw gatewayFailure(
            ErrorCode.MODEL_OUTPUT_INVALID,
            "Extraction gateway returned a non-JSON response.",
            { reason: "gateway_response_not_json", alias },
          );
        }

        const extracted = extractJsonFromLiteLlmCompletion(data);
        if (!extracted.ok) {
          throw gatewayFailure(
            ErrorCode.MODEL_OUTPUT_INVALID,
            "Model returned invalid JSON.",
            modelOutputInvalidDiagnostics(data, extracted.reason, alias),
          );
        }

        return {
          parsed: extracted.parsed,
          alias,
          durationMs,
          finishReason: allowlistedFinishReason(data),
          usage: parseLiteLlmTokenUsage(data),
          providerModel: readLiteLlmProviderModel(data),
          gatewayRequestId: readLiteLlmGatewayRequestId(data),
          prefixCachingVerified: PACK_EXTRACTION_LITELLM_PREFIX_CACHING_VERIFIED,
        };
      } catch (error) {
        if (error instanceof PlanningError) {
          throw error;
        }
        const durationMs = Date.now() - started;
        if (isTimeout(error)) {
          throw gatewayFailure(
            ErrorCode.MODEL_TIMEOUT,
            "Extraction model timed out.",
            { reason: "model_timeout", alias, duration_ms: durationMs },
          );
        }
        throw gatewayFailure(
          ErrorCode.MODEL_UNAVAILABLE,
          "Extraction gateway request failed.",
          { reason: "gateway_request_failed", alias, duration_ms: durationMs },
        );
      }
    },
  };
}
