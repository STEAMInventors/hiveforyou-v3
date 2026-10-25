import { readFileSync } from "node:fs";

import { DOMAIN_PACK_MANIFEST_V2 } from "@hiveforyou/contracts/domain-packs/v2";
import { ErrorCode } from "@hiveforyou/contracts/errors/v1";
import {
  PACK_EXTRACTION_VALIDATOR_VERSION,
  packExtractionDocumentArtifactKind,
  type PackExtractionDispositionV1,
  type PackExtractionDocumentMarkerV1,
  type PackExtractionValidationV1,
} from "@hiveforyou/contracts/pack-extraction/v1";
import type { ReaderReadDocumentResponseV1 } from "@hiveforyou/contracts/reader/v1";
import { RUN_ARTIFACT_CONTRACT_VERSION } from "@hiveforyou/contracts/study-runs/v1";
import {
  computeJcsSha256Digest,
  computePackDigest,
  type NormalizedDomainPackManifest,
} from "@hiveforyou/core";

import { PlanningError } from "../plan/errors.js";
import { putRunArtifactIdempotent } from "../persistence/artifact-idempotent-put.js";
import {
  prepareDocumentPagesForInsert,
  putDocumentPagesForSource,
} from "../persistence/document-pages-persistence.js";
import {
  findReusablePackExtractionBatch,
  getRunPackExtractionBatch,
  putPackExtractionBatch,
  type PackExtractionBatchInsert,
  type PackExtractionBatchSummary,
} from "../persistence/pack-extraction-persistence.js";
import {
  toReaderSource,
  type WorkerRegisteredSourceRowV1,
} from "../persistence/p15-worker-context.js";
import type { StudyRunPersistenceClient } from "../persistence/study-run-persistence.js";
import type { ReaderClient } from "../reader/reader-client.js";
import type { PackExtractionLiteLlmClient } from "../reasoning/litellm-extraction-client.js";
import type { CompiledPackSystemPrompt } from "./compile-system-prompt.js";
import { callPackExtractionModel } from "./extract-pack-document.js";
import {
  PACK_EXTRACTION_SOURCE_REF_ID,
  planPackExtractionWindows,
  type PackExtractionBudget,
  type PackExtractionWindow,
} from "./plan-windows.js";
import { validatePackExtractionOutput } from "./validate-extraction.js";

/** Complete candidate JSON above this size is not stored (no truncation, no Storage spill). */
export const MAX_EXTRACTION_JSON_BYTES = 1_048_576;

/** Default document-level concurrency until provider rate limits are verified. */
export const DEFAULT_PACK_EXTRACTION_CONCURRENCY = 2;

/** Hard upper bound on concurrent documents per run to avoid gateway/Reader stampedes. */
export const MAX_PACK_EXTRACTION_CONCURRENCY = 4;

function clampPackExtractionConcurrency(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_PACK_EXTRACTION_CONCURRENCY;
  }
  const integer = Math.trunc(value);
  if (integer < 1) {
    return DEFAULT_PACK_EXTRACTION_CONCURRENCY;
  }
  return Math.min(integer, MAX_PACK_EXTRACTION_CONCURRENCY);
}

/** Reads `WORKER_P2_EXTRACTION_CONCURRENCY` (supported 1..4; default 2). */
export function readPackExtractionConcurrency(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.WORKER_P2_EXTRACTION_CONCURRENCY?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return clampPackExtractionConcurrency(parsed);
}

export type LoadedPackForSelection = {
  manifest: NormalizedDomainPackManifest;
  digest: string;
  manifestPath: string;
};

export type SelectedPack = {
  manifest: NormalizedDomainPackManifest;
  manifestBytes: string;
  digest: string;
  domainId: string;
};

export function packExtractionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.WORKER_ENABLE_PACK_EXTRACTION?.trim() === "1";
}

export type PackExtractionRoute =
  | { kind: "generic" }
  | { kind: "selected_pack"; pack: SelectedPack };

function loadSelectedPackForHint(
  packs: LoadedPackForSelection[],
  hint: string,
): SelectedPack {
  const matches = packs.filter(
    (pack) =>
      pack.manifest.contract_version === DOMAIN_PACK_MANIFEST_V2 &&
      pack.manifest.review_status === "reviewed" &&
      pack.manifest.domains.some((domain) => domain.domain_id === hint),
  );
  if (matches.length === 0) {
    throw new PlanningError(ErrorCode.INVALID_REQUEST, "The selected Domain Pack is not available.", {
      reason: "pack_not_available",
    });
  }
  if (matches.length > 1) {
    throw new PlanningError(ErrorCode.INVALID_REQUEST, "More than one Domain Pack matches this run.", {
      reason: "pack_ambiguous",
    });
  }
  const pack = matches[0]!;
  let manifestBytes: string;
  try {
    manifestBytes = readFileSync(pack.manifestPath, "utf8");
  } catch {
    throw new PlanningError(ErrorCode.INVALID_REQUEST, "The selected Domain Pack is not available.", {
      reason: "pack_not_available",
    });
  }
  if (computePackDigest(manifestBytes) !== pack.digest) {
    throw new PlanningError(ErrorCode.INVALID_REQUEST, "The selected Domain Pack changed on disk.", {
      reason: "pack_invalid",
    });
  }
  return { manifest: pack.manifest, manifestBytes, digest: pack.digest, domainId: hint };
}

/**
 * UI-submitted `domain_hint` selects Pack extraction when present; pack-free runs use the generic path.
 * A non-null hint never falls back to generic — missing, disabled, or unreviewed Packs fail closed.
 */
export function resolvePackExtractionRoute(input: {
  packs: LoadedPackForSelection[];
  domainHint: string | null;
  env?: NodeJS.ProcessEnv;
}): PackExtractionRoute {
  if (!input.domainHint) {
    return { kind: "generic" };
  }
  if (!packExtractionEnabled(input.env)) {
    throw new PlanningError(
      ErrorCode.INVALID_REQUEST,
      "Domain Pack extraction is not enabled in this environment.",
      { reason: "pack_extraction_disabled" },
    );
  }
  return { kind: "selected_pack", pack: loadSelectedPackForHint(input.packs, input.domainHint) };
}

/** Returns a reviewed Pack when enabled and the hint resolves; null only when the hint is omitted. */
export function resolveSelectedPack(input: {
  packs: LoadedPackForSelection[];
  domainHint: string | null;
  env?: NodeJS.ProcessEnv;
}): SelectedPack | null {
  const route = resolvePackExtractionRoute(input);
  return route.kind === "selected_pack" ? route.pack : null;
}

export type PackExtractionDocumentSummary = {
  source_document_id: string;
  document_type_id: string | null;
  domain_id: string;
  pack_id: string;
  candidate_field_count: number;
  disposition: PackExtractionDispositionV1;
  window_count: number;
};

export type RunPackExtractionInput = {
  persistence: StudyRunPersistenceClient;
  reader: ReaderClient;
  extraction: PackExtractionLiteLlmClient;
  compiled: CompiledPackSystemPrompt;
  documentTypeIds: ReadonlySet<string>;
  domainId: string;
  modelAlias: string;
  budget: PackExtractionBudget;
  studyRunId: string;
  correlationId: string;
  ownerUserId: string;
  sources: WorkerRegisteredSourceRowV1[];
  /** Max concurrent documents (1..4); defaults to `readPackExtractionConcurrency()`. */
  concurrency?: number;
};

type PackExtractionLogEvent = {
  level: "info" | "error";
  correlation_id: string;
  study_run_id: string;
  source_document_id: string;
  extraction_batch_id?: string;
  prompt_digest: string;
  pack_id: string;
  pack_version: string;
  page_start: number;
  page_end: number;
  mode?: string;
  outcome: "extracted" | "replayed" | "reused" | "failed";
  model_alias?: string | null;
  provider_model?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cached_input_tokens?: number | null;
  cache_write_tokens?: number | null;
  cache_status?: string;
  latency_ms?: number | null;
  finish_reason?: string | null;
  disposition: PackExtractionDispositionV1;
  facts_accepted: number;
  facts_rejected: number;
  records_rejected: number;
  rejection_reason_counts?: Record<string, number>;
  error_code?: string | null;
  error_reason?: string | null;
};

/** Sanitized log: IDs, digests, counts and codes only (no prompt, page text, quotes or values). */
function emitPackExtractionLog(event: PackExtractionLogEvent): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "worker",
    stage: "extract",
    ...event,
  });
  if (event.level === "error") {
    console.error(line);
    return;
  }
  console.info(line);
}

function reasonCounts(validation: PackExtractionValidationV1): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const rejection of validation.rejections) {
    counts[rejection.reason_code] = (counts[rejection.reason_code] ?? 0) + 1;
  }
  return counts;
}

function unusableValidation(): PackExtractionValidationV1 {
  return {
    contract_version: "pack-extraction-validation@1",
    disposition: "UNUSABLE",
    counts: { records: 0, facts_accepted: 0, facts_rejected: 0, records_rejected: 0 },
    rejections: [],
    validator_version: PACK_EXTRACTION_VALIDATOR_VERSION,
  };
}

function batchBase(
  input: RunPackExtractionInput,
  source: WorkerRegisteredSourceRowV1,
  read: ReaderReadDocumentResponseV1,
  window: { page_start: number; page_end: number; is_partial: boolean },
  pageSetDigest: string,
): Pick<
  PackExtractionBatchInsert,
  | "source_document_id"
  | "source_sha256"
  | "read_fingerprint"
  | "page_set_digest"
  | "prompt_digest"
  | "pack_id"
  | "pack_version"
  | "pack_digest"
  | "output_contract_version"
  | "partition_id"
  | "page_start"
  | "page_end"
  | "is_partial"
  | "validator_version"
> {
  return {
    source_document_id: source.source_document_id,
    source_sha256: read.source.sha256 || source.sha256,
    read_fingerprint: read.read_fingerprint,
    page_set_digest: pageSetDigest,
    prompt_digest: input.compiled.prompt_digest,
    pack_id: input.compiled.pack_id,
    pack_version: input.compiled.pack_version,
    pack_digest: input.compiled.pack_digest,
    output_contract_version: input.compiled.output_contract_version,
    partition_id: null,
    page_start: window.page_start,
    page_end: window.page_end,
    is_partial: window.is_partial,
    validator_version: PACK_EXTRACTION_VALIDATOR_VERSION,
  };
}

function failedBatch(
  base: ReturnType<typeof batchBase>,
  input: {
    modelAlias: string;
    errorCode: string;
    errorReason: string;
    usage?: Partial<PackExtractionBatchInsert>;
    extractionSha256?: string | null;
    extractionByteLength?: number | null;
  },
): PackExtractionBatchInsert {
  return {
    ...base,
    model_alias: input.modelAlias,
    provider_model: null,
    gateway_request_id: null,
    input_tokens: null,
    output_tokens: null,
    cached_input_tokens: null,
    cache_write_tokens: null,
    cache_status: "NOT_REPORTED",
    latency_ms: null,
    finish_reason: null,
    ...input.usage,
    extraction_json: null,
    extraction_sha256: input.extractionSha256 ?? null,
    extraction_byte_length: input.extractionByteLength ?? null,
    validation_json: unusableValidation(),
    accepted_facts_json: [],
    disposition: "UNUSABLE",
    classification_status: null,
    primary_document_type_id: null,
    status: "FAILED",
    error_code: input.errorCode,
    error_reason: input.errorReason,
    reused_from_batch_id: null,
  };
}

/** Maps a non-retryable extraction-call failure to the design §9 batch error (safe codes only). */
function callFailureReason(error: PlanningError): { errorCode: string; errorReason: string } {
  const reason = typeof error.diagnostics.reason === "string" ? error.diagnostics.reason : "";
  if (reason === "context_limit_rejected") {
    return { errorCode: ErrorCode.EXTRACTION_FAILED, errorReason: "context_length_exceeded" };
  }
  if (reason === "gateway_rejected") {
    return { errorCode: ErrorCode.MODEL_OUTPUT_INVALID, errorReason: "gateway_rejected" };
  }
  if (error.diagnostics.finish_reason === "length") {
    return { errorCode: ErrorCode.MODEL_OUTPUT_INVALID, errorReason: "output_truncated" };
  }
  return { errorCode: ErrorCode.MODEL_OUTPUT_INVALID, errorReason: "output_not_json" };
}

function documentDisposition(dispositions: PackExtractionDispositionV1[]): PackExtractionDispositionV1 {
  if (dispositions.includes("UNUSABLE")) return "UNUSABLE";
  if (dispositions.includes("VALID_WITH_REJECTIONS")) return "VALID_WITH_REJECTIONS";
  if (dispositions.length > 0 && dispositions.every((d) => d === "UNRECOGNIZED")) return "UNRECOGNIZED";
  return "VALID";
}

async function extractWindow(
  input: RunPackExtractionInput,
  source: WorkerRegisteredSourceRowV1,
  read: ReaderReadDocumentResponseV1,
  window: PackExtractionWindow,
  pageText: ReadonlyMap<number, string>,
  pageSetDigest: string,
): Promise<PackExtractionBatchSummary> {
  const { compiled } = input;
  const base = batchBase(input, source, read, window, pageSetDigest);
  const logBase = {
    correlation_id: input.correlationId,
    study_run_id: input.studyRunId,
    source_document_id: source.source_document_id,
    prompt_digest: compiled.prompt_digest,
    pack_id: compiled.pack_id,
    pack_version: compiled.pack_version,
    page_start: window.page_start,
    page_end: window.page_end,
    mode: window.mode,
  };

  const existing = await getRunPackExtractionBatch(input.persistence, {
    studyRunId: input.studyRunId,
    sourceDocumentId: source.source_document_id,
    promptDigest: compiled.prompt_digest,
    pageStart: window.page_start,
  });
  if (existing) {
    emitPackExtractionLog({
      level: "info",
      ...logBase,
      extraction_batch_id: existing.id,
      outcome: "replayed",
      disposition: existing.disposition,
      facts_accepted: existing.validation_json.counts.facts_accepted,
      facts_rejected: existing.validation_json.counts.facts_rejected,
      records_rejected: existing.validation_json.counts.records_rejected,
    });
    return existing;
  }

  const reusable = await findReusablePackExtractionBatch(input.persistence, {
    studyRunId: input.studyRunId,
    sourceSha256: base.source_sha256,
    readFingerprint: base.read_fingerprint,
    pageSetDigest: base.page_set_digest,
    promptDigest: compiled.prompt_digest,
    modelAlias: input.modelAlias,
    pageStart: window.page_start,
    pageEnd: window.page_end,
  });
  if (reusable) {
    const { batch } = await putPackExtractionBatch(input.persistence, input.studyRunId, {
      ...base,
      model_alias: input.modelAlias,
      provider_model: reusable.provider_model,
      gateway_request_id: null,
      input_tokens: null,
      output_tokens: null,
      cached_input_tokens: null,
      cache_write_tokens: null,
      cache_status: "NOT_REPORTED",
      latency_ms: null,
      finish_reason: reusable.finish_reason,
      extraction_json: reusable.extraction_json,
      extraction_sha256: reusable.extraction_sha256,
      extraction_byte_length: reusable.extraction_byte_length,
      validation_json: reusable.validation_json,
      accepted_facts_json: reusable.accepted_facts_json,
      disposition: reusable.disposition,
      classification_status: reusable.classification_status,
      primary_document_type_id: reusable.primary_document_type_id,
      validator_version: reusable.validator_version,
      status: "SUCCEEDED",
      error_code: null,
      error_reason: null,
      reused_from_batch_id: reusable.id,
    });
    emitPackExtractionLog({
      level: "info",
      ...logBase,
      extraction_batch_id: batch.id,
      outcome: "reused",
      model_alias: input.modelAlias,
      disposition: batch.disposition,
      facts_accepted: batch.validation_json.counts.facts_accepted,
      facts_rejected: batch.validation_json.counts.facts_rejected,
      records_rejected: batch.validation_json.counts.records_rejected,
    });
    return batch;
  }

  let call: Awaited<ReturnType<typeof callPackExtractionModel>>;
  try {
    call = await callPackExtractionModel(input.extraction, {
      systemPrompt: compiled.system_text,
      userMessageJson: window.userMessageJson,
      prompt_digest: compiled.prompt_digest,
      correlationId: input.correlationId,
      studyRunId: input.studyRunId,
      extractionBatchId: `${input.studyRunId}:${source.source_document_id}:${window.page_start}`,
      maxOutputTokens: input.budget.outputReserveTokens,
      pack_id: compiled.pack_id,
      pack_version: compiled.pack_version,
    });
  } catch (error) {
    if (!(error instanceof PlanningError) || error.retryable) {
      throw error;
    }
    const failure = callFailureReason(error);
    const contentLength = error.diagnostics.message_content_length;
    const finish = error.diagnostics.finish_reason;
    const { batch } = await putPackExtractionBatch(
      input.persistence,
      input.studyRunId,
      failedBatch(base, {
        modelAlias: typeof error.diagnostics.alias === "string" ? error.diagnostics.alias : input.modelAlias,
        errorCode: failure.errorCode,
        errorReason: failure.errorReason,
        usage: { finish_reason: typeof finish === "string" ? finish : null },
        extractionByteLength: typeof contentLength === "number" ? contentLength : null,
      }),
    );
    emitPackExtractionLog({
      level: "error",
      ...logBase,
      extraction_batch_id: batch.id,
      outcome: "failed",
      disposition: "UNUSABLE",
      facts_accepted: 0,
      facts_rejected: 0,
      records_rejected: 0,
      error_code: failure.errorCode,
      error_reason: failure.errorReason,
    });
    return batch;
  }

  const usage: Partial<PackExtractionBatchInsert> = {
    provider_model: call.providerModel,
    gateway_request_id: call.gatewayRequestId,
    input_tokens: call.usage.input_tokens,
    output_tokens: call.usage.output_tokens,
    cached_input_tokens: call.usage.cached_input_tokens,
    cache_write_tokens: call.usage.cache_write_tokens,
    cache_status: call.usage.cache_status,
    latency_ms: call.durationMs,
    finish_reason: call.finishReason,
  };
  const usageLog = {
    model_alias: call.alias,
    provider_model: call.providerModel,
    input_tokens: call.usage.input_tokens,
    output_tokens: call.usage.output_tokens,
    cached_input_tokens: call.usage.cached_input_tokens,
    cache_write_tokens: call.usage.cache_write_tokens,
    cache_status: call.usage.cache_status,
    latency_ms: call.durationMs,
    finish_reason: call.finishReason,
  };

  const rawJson = JSON.stringify(call.raw) ?? "null";
  const extractionByteLength = Buffer.byteLength(rawJson, "utf8");
  const extractionSha256 = computeJcsSha256Digest(call.raw ?? null);

  const outcome = validatePackExtractionOutput(call.raw, {
    catalog: compiled.catalog.catalog,
    documentTypeIds: input.documentTypeIds,
    promptDigest: compiled.prompt_digest,
    sourceRefId: PACK_EXTRACTION_SOURCE_REF_ID,
    window: { page_start: window.page_start, page_end: window.page_end },
    pageText,
    finishReason: call.finishReason,
  });

  let insert: PackExtractionBatchInsert;
  if (!outcome.usable) {
    insert = failedBatch(base, {
      modelAlias: call.alias,
      errorCode: ErrorCode.MODEL_OUTPUT_INVALID,
      errorReason: outcome.reason,
      usage,
      extractionSha256,
      extractionByteLength,
    });
  } else if (extractionByteLength > MAX_EXTRACTION_JSON_BYTES) {
    insert = failedBatch(base, {
      modelAlias: call.alias,
      errorCode: ErrorCode.EXTRACTION_FAILED,
      errorReason: "payload_too_large",
      usage,
      extractionSha256,
      extractionByteLength,
    });
  } else {
    insert = {
      ...base,
      model_alias: call.alias,
      provider_model: call.providerModel,
      gateway_request_id: call.gatewayRequestId,
      input_tokens: call.usage.input_tokens,
      output_tokens: call.usage.output_tokens,
      cached_input_tokens: call.usage.cached_input_tokens,
      cache_write_tokens: call.usage.cache_write_tokens,
      cache_status: call.usage.cache_status,
      latency_ms: call.durationMs,
      finish_reason: call.finishReason,
      extraction_json: call.raw,
      extraction_sha256: extractionSha256,
      extraction_byte_length: extractionByteLength,
      validation_json: outcome.validation,
      accepted_facts_json: outcome.acceptedFacts,
      disposition: outcome.validation.disposition,
      classification_status: outcome.classification.status,
      primary_document_type_id: outcome.classification.primary_document_type_id,
      status: "SUCCEEDED",
      error_code: null,
      error_reason: null,
      reused_from_batch_id: null,
    };
  }

  const { batch } = await putPackExtractionBatch(input.persistence, input.studyRunId, insert);
  emitPackExtractionLog({
    level: insert.status === "FAILED" ? "error" : "info",
    ...logBase,
    ...usageLog,
    extraction_batch_id: batch.id,
    outcome: insert.status === "FAILED" ? "failed" : "extracted",
    disposition: insert.disposition,
    facts_accepted: insert.validation_json.counts.facts_accepted,
    facts_rejected: insert.validation_json.counts.facts_rejected,
    records_rejected: insert.validation_json.counts.records_rejected,
    rejection_reason_counts: reasonCounts(insert.validation_json),
    error_code: insert.error_code,
    error_reason: insert.error_reason,
  });
  return batch;
}

type PackExtractionRunSummaryLogEvent = {
  level: "info" | "error";
  event: "pack_extraction_run_summary";
  correlation_id: string;
  study_run_id: string;
  prompt_digest: string;
  pack_id: string;
  pack_version: string;
  concurrency_limit: number;
  max_in_flight_documents: number;
  source_count: number;
  documents_completed: number;
  unusable_document_count: number;
  duration_ms: number;
  error_code?: string | null;
  retryable?: boolean | null;
};

function emitPackExtractionRunSummaryLog(event: PackExtractionRunSummaryLogEvent): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "worker",
    stage: "extract",
    ...event,
  });
  if (event.level === "error") {
    console.error(line);
    return;
  }
  console.info(line);
}

async function extractSourceDocument(
  input: RunPackExtractionInput,
  source: WorkerRegisteredSourceRowV1,
): Promise<PackExtractionDocumentSummary> {
  const readerSource = toReaderSource(source, input.ownerUserId);
  const read = await input.reader.readDocument({
    source: readerSource,
    correlationId: input.correlationId,
    studyRunId: input.studyRunId,
    extractionBatchId: source.source_document_id,
  });
  if (read.status !== "SUCCEEDED") {
    throw new PlanningError(ErrorCode.EXTRACTION_FAILED, "A document could not be read.", {
      reason: "source_read_failed",
    });
  }

  const preparedPages = prepareDocumentPagesForInsert({ source, read });

  await putDocumentPagesForSource(input.persistence, {
    studyRunId: input.studyRunId,
    correlationId: input.correlationId,
    source,
    read,
  });

  const pageSetDigest = preparedPages.pageSetDigest;
  const pageText = new Map(read.pages.map((page) => [page.page_number, page.text]));
  let windows: PackExtractionWindow[];
  try {
    windows = planPackExtractionWindows({
      promptDigest: input.compiled.prompt_digest,
      promptTokens: input.compiled.estimated_prompt_tokens,
      read,
      budget: input.budget,
    });
  } catch (error) {
    if (!(error instanceof PlanningError)) {
      throw error;
    }
    const base = batchBase(input, source, read, {
      page_start: 1,
      page_end: Math.max(1, read.page_count),
      is_partial: false,
    }, pageSetDigest);
    const { batch } = await putPackExtractionBatch(
      input.persistence,
      input.studyRunId,
      failedBatch(base, {
        modelAlias: input.modelAlias,
        errorCode: ErrorCode.EXTRACTION_FAILED,
        errorReason: "context_budget_exceeded",
      }),
    );
    emitPackExtractionLog({
      level: "error",
      correlation_id: input.correlationId,
      study_run_id: input.studyRunId,
      source_document_id: source.source_document_id,
      extraction_batch_id: batch.id,
      prompt_digest: input.compiled.prompt_digest,
      pack_id: input.compiled.pack_id,
      pack_version: input.compiled.pack_version,
      page_start: base.page_start,
      page_end: base.page_end,
      outcome: "failed",
      disposition: "UNUSABLE",
      facts_accepted: 0,
      facts_rejected: 0,
      records_rejected: 0,
      error_code: ErrorCode.EXTRACTION_FAILED,
      error_reason: "context_budget_exceeded",
    });
    return {
      source_document_id: source.source_document_id,
      document_type_id: null,
      domain_id: input.domainId,
      pack_id: input.compiled.pack_id,
      candidate_field_count: 0,
      disposition: "UNUSABLE",
      window_count: 0,
    };
  }

  const batches: PackExtractionBatchSummary[] = [];
  for (const window of windows) {
    batches.push(await extractWindow(input, source, read, window, pageText, pageSetDigest));
  }

  const disposition = documentDisposition(batches.map((batch) => batch.disposition));
  return {
    source_document_id: source.source_document_id,
    document_type_id: batches.find((batch) => batch.primary_document_type_id)?.primary_document_type_id ?? null,
    domain_id: input.domainId,
    pack_id: input.compiled.pack_id,
    candidate_field_count: batches.reduce(
      (sum, batch) => sum + batch.validation_json.counts.facts_accepted,
      0,
    ),
    disposition,
    window_count: windows.length,
  };
}

/** Owner-visible "document finished" marker; identical on replay, so retries stay idempotent. */
async function putDocumentFinishedMarker(
  input: RunPackExtractionInput,
  summary: PackExtractionDocumentSummary,
): Promise<void> {
  const payload: PackExtractionDocumentMarkerV1 = {
    source_document_id: summary.source_document_id,
    disposition: summary.disposition,
    window_count: summary.window_count,
  };
  await putRunArtifactIdempotent(input.persistence, {
    studyRunId: input.studyRunId,
    artifactKind: packExtractionDocumentArtifactKind(summary.source_document_id),
    contractVersion: RUN_ARTIFACT_CONTRACT_VERSION,
    payload,
  });
}

function errorMetadata(error: unknown): { errorCode: string | null; retryable: boolean | null } {
  if (error && typeof error === "object") {
    const code = (error as { errorCode?: unknown }).errorCode;
    const retryable = (error as { retryable?: unknown }).retryable;
    return {
      errorCode: typeof code === "string" ? code : null,
      retryable: typeof retryable === "boolean" ? retryable : null,
    };
  }
  return { errorCode: null, retryable: null };
}

/**
 * Selected-Pack extract stage: Reader text preparation, then one Worker-owned extraction call
 * per document window, fact-level validation and idempotent batch persistence.
 * Independent documents run concurrently up to `concurrency` (1..4, default 2); windows within a
 * document run sequentially. On a thrown error, scheduling stops and in-flight documents finish
 * and persist their batches before the error propagates.
 */
export async function runPackExtractionForSources(
  input: RunPackExtractionInput,
): Promise<{ documents: PackExtractionDocumentSummary[]; unusableDocumentCount: number }> {
  const startedAt = Date.now();
  const concurrencyLimit =
    input.concurrency !== undefined
      ? clampPackExtractionConcurrency(input.concurrency)
      : readPackExtractionConcurrency();
  const sourceCount = input.sources.length;
  const workerCount = Math.min(concurrencyLimit, Math.max(1, sourceCount));

  const summaries: Array<PackExtractionDocumentSummary | undefined> = new Array(sourceCount);
  let nextIndex = 0;
  let inFlightDocuments = 0;
  let maxInFlightDocuments = 0;
  let documentsCompleted = 0;
  let firstError: unknown = null;
  let hasError = false;

  const runWorker = async (): Promise<void> => {
    while (!hasError) {
      const index = nextIndex;
      if (index >= sourceCount) {
        return;
      }
      nextIndex += 1;
      const source = input.sources[index]!;
      inFlightDocuments += 1;
      if (inFlightDocuments > maxInFlightDocuments) {
        maxInFlightDocuments = inFlightDocuments;
      }
      try {
        const summary = await extractSourceDocument(input, source);
        await putDocumentFinishedMarker(input, summary);
        summaries[index] = summary;
        documentsCompleted += 1;
      } catch (error) {
        if (!hasError) {
          hasError = true;
          firstError = error;
        }
      } finally {
        inFlightDocuments -= 1;
      }
    }
  };

  if (sourceCount > 0) {
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  }

  let unusableDocumentCount = 0;
  for (const summary of summaries) {
    if (summary?.disposition === "UNUSABLE") {
      unusableDocumentCount += 1;
    }
  }

  const durationMs = Date.now() - startedAt;
  if (hasError) {
    const meta = errorMetadata(firstError);
    emitPackExtractionRunSummaryLog({
      level: "error",
      event: "pack_extraction_run_summary",
      correlation_id: input.correlationId,
      study_run_id: input.studyRunId,
      prompt_digest: input.compiled.prompt_digest,
      pack_id: input.compiled.pack_id,
      pack_version: input.compiled.pack_version,
      concurrency_limit: concurrencyLimit,
      max_in_flight_documents: maxInFlightDocuments,
      source_count: sourceCount,
      documents_completed: documentsCompleted,
      unusable_document_count: unusableDocumentCount,
      duration_ms: durationMs,
      error_code: meta.errorCode,
      retryable: meta.retryable,
    });
    throw firstError;
  }

  emitPackExtractionRunSummaryLog({
    level: "info",
    event: "pack_extraction_run_summary",
    correlation_id: input.correlationId,
    study_run_id: input.studyRunId,
    prompt_digest: input.compiled.prompt_digest,
    pack_id: input.compiled.pack_id,
    pack_version: input.compiled.pack_version,
    concurrency_limit: concurrencyLimit,
    max_in_flight_documents: maxInFlightDocuments,
    source_count: sourceCount,
    documents_completed: documentsCompleted,
    unusable_document_count: unusableDocumentCount,
    duration_ms: durationMs,
  });

  const documents = summaries.map((summary, idx) => {
    if (!summary) {
      throw new Error(`Missing extraction summary at index ${idx}`);
    }
    return summary;
  });

  return { documents, unusableDocumentCount };
}
