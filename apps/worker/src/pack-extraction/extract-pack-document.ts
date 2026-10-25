import { ErrorCode } from "@hiveforyou/contracts/errors/v1";
import {
  parsePackExtractionOutputV1,
  type PackExtractionOutputV1,
  type ParsePackExtractionOutputOptionsV1,
} from "@hiveforyou/contracts/pack-extraction/v1";

import { PlanningError } from "../plan/errors.js";
import type {
  ExtractPackDocumentLiteLlmRequest,
  PackExtractionLiteLlmClient,
} from "../reasoning/litellm-extraction-client.js";
import type { LiteLlmTokenUsage } from "../reasoning/litellm-usage.js";

export type ExtractPackDocumentRequest = ExtractPackDocumentLiteLlmRequest & {
  pack_id: string;
  pack_version: string;
  parseOptions?: ParsePackExtractionOutputOptionsV1;
};

export type PackExtractionSafeDiagnostics = {
  correlation_id: string | null;
  pack_id: string;
  pack_version: string;
  prompt_digest: string;
  model_alias: string;
  provider_model: string | null;
  gateway_request_id: string | null;
  system_prompt_byte_length: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_input_tokens: number | null;
  cache_write_tokens: number | null;
  cache_status: LiteLlmTokenUsage["cache_status"];
  prefix_caching_verified: boolean;
  duration_ms: number;
  finish_reason: string | null;
};

export type ExtractPackDocumentResult = {
  output: PackExtractionOutputV1;
  alias: string;
  durationMs: number;
  finishReason: string | null;
  usage: LiteLlmTokenUsage;
  providerModel: string | null;
  gatewayRequestId: string | null;
  diagnostics: PackExtractionSafeDiagnostics;
};

function buildSafeDiagnostics(
  request: ExtractPackDocumentRequest,
  alias: string,
  durationMs: number,
  finishReason: string | null,
  usage: LiteLlmTokenUsage,
  providerModel: string | null,
  gatewayRequestId: string | null,
  prefixCachingVerified: boolean,
): PackExtractionSafeDiagnostics {
  return {
    correlation_id: request.correlationId ?? null,
    pack_id: request.pack_id,
    pack_version: request.pack_version,
    prompt_digest: request.prompt_digest,
    model_alias: alias,
    provider_model: providerModel,
    gateway_request_id: gatewayRequestId,
    system_prompt_byte_length: Buffer.byteLength(request.systemPrompt, "utf8"),
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cached_input_tokens: usage.cached_input_tokens,
    cache_write_tokens: usage.cache_write_tokens,
    cache_status: usage.cache_status,
    prefix_caching_verified: prefixCachingVerified,
    duration_ms: durationMs,
    finish_reason: finishReason,
  };
}

export type CallPackExtractionModelResult = Omit<ExtractPackDocumentResult, "output"> & {
  /** Untrusted parsed JSON; validate with `validatePackExtractionOutput` before use. */
  raw: unknown;
};

/**
 * Submit one `extract_pack_document` LiteLLM call and return the untrusted parsed JSON
 * for fact-level validation. Does not log prompts, user JSON, or model completions.
 */
export async function callPackExtractionModel(
  client: PackExtractionLiteLlmClient,
  request: ExtractPackDocumentRequest,
): Promise<CallPackExtractionModelResult> {
  const response = await client.extractPackDocument(request);
  return {
    raw: response.parsed,
    alias: response.alias,
    durationMs: response.durationMs,
    finishReason: response.finishReason,
    usage: response.usage,
    providerModel: response.providerModel,
    gatewayRequestId: response.gatewayRequestId,
    diagnostics: buildSafeDiagnostics(
      request,
      response.alias,
      response.durationMs,
      response.finishReason,
      response.usage,
      response.providerModel,
      response.gatewayRequestId,
      response.prefixCachingVerified,
    ),
  };
}

/**
 * Submit one `extract_pack_document` LiteLLM call and strictly parse `pack-extraction-output@1`
 * (whole-output contract check). Does not log prompts, user JSON, or model completions.
 */
export async function extractPackDocument(
  client: PackExtractionLiteLlmClient,
  request: ExtractPackDocumentRequest,
): Promise<ExtractPackDocumentResult> {
  const { raw, ...rest } = await callPackExtractionModel(client, request);

  const parsedOutput = parsePackExtractionOutputV1(raw, request.parseOptions);
  if (!parsedOutput.ok) {
    throw new PlanningError(
      ErrorCode.MODEL_OUTPUT_INVALID,
      "Model output failed pack-extraction-output@1 validation.",
      {
        reason: "output_contract_invalid",
        alias: rest.alias,
        field: parsedOutput.field ?? null,
      },
    );
  }

  return { output: parsedOutput.value, ...rest };
}
