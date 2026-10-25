import { describe, expect, it } from "vitest";

import { ErrorCode } from "@hiveforyou/contracts/errors/v1";

import { FakeExtractionStore, loadIep200 } from "../pack-extraction/pack-extraction.fixture.js";
import {
  MAX_INLINE_DB_TRANSIENT_ATTEMPTS,
  PACK_EXTRACTION_REF_ARTIFACT_KIND,
  PackExtractionPersistenceError,
  putPackExtractionBatch,
  putPackExtractionPrompt,
  putPackExtractionRefArtifact,
  type PackExtractionBatchInsert,
} from "./pack-extraction-persistence.js";

const { compiled } = loadIep200();
const RUN = "run-1";

function store(): FakeExtractionStore {
  const s = new FakeExtractionStore();
  s.addRun(RUN, "hive-1");
  return s;
}

function batch(overrides: Partial<PackExtractionBatchInsert> = {}): PackExtractionBatchInsert {
  return {
    source_document_id: "doc-1",
    source_sha256: "a".repeat(64),
    read_fingerprint: "fp-1",
    page_set_digest: `sha256:${"a".repeat(64)}`,
    prompt_digest: compiled.prompt_digest,
    pack_id: compiled.pack_id,
    pack_version: compiled.pack_version,
    pack_digest: compiled.pack_digest,
    output_contract_version: compiled.output_contract_version,
    partition_id: null,
    page_start: 1,
    page_end: 1,
    is_partial: false,
    model_alias: "worker-p2-extraction",
    provider_model: null,
    gateway_request_id: null,
    input_tokens: null,
    output_tokens: null,
    cached_input_tokens: null,
    cache_write_tokens: null,
    cache_status: "NOT_REPORTED",
    latency_ms: 10,
    finish_reason: "stop",
    extraction_json: { records: [] },
    extraction_sha256: `sha256:${"b".repeat(64)}`,
    extraction_byte_length: 14,
    validation_json: {
      contract_version: "pack-extraction-validation@1",
      disposition: "VALID",
      counts: { records: 0, facts_accepted: 0, facts_rejected: 0, records_rejected: 0 },
      rejections: [],
      validator_version: "pack-extraction-validator@1",
    },
    accepted_facts_json: [],
    disposition: "VALID",
    classification_status: "CLASSIFIED",
    primary_document_type_id: "iep.plan",
    validator_version: "pack-extraction-validator@1",
    status: "SUCCEEDED",
    error_code: null,
    error_reason: null,
    reused_from_batch_id: null,
    ...overrides,
  };
}

describe("putPackExtractionBatch", () => {
  it("is idempotent for identical content on the same key", async () => {
    const s = store();
    const first = await putPackExtractionBatch(s.client, RUN, batch());
    const second = await putPackExtractionBatch(s.client, RUN, batch());
    expect(first.inserted).toBe(true);
    expect(second).toMatchObject({ inserted: false, batch: { id: first.batch.id } });
    expect(s.batchesFor(RUN)).toHaveLength(1);
  });

  it("never overwrites different content on the same key", async () => {
    const s = store();
    await putPackExtractionBatch(s.client, RUN, batch());
    await expect(
      putPackExtractionBatch(s.client, RUN, batch({ extraction_sha256: `sha256:${"c".repeat(64)}` })),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.INVALID_REQUEST,
      reason: "batch_hash_conflict",
      retryable: false,
    });
    expect(s.batchesFor(RUN)).toHaveLength(1);
  });

  it("reads back after a lost response (committed) instead of inserting twice", async () => {
    const s = store();
    s.failNext("hive3_p2px_worker_put_extraction_batch", "TypeError: fetch failed", 1, true);
    const result = await putPackExtractionBatch(s.client, RUN, batch());
    expect(result.inserted).toBe(false);
    expect(s.batchesFor(RUN)).toHaveLength(1);
  });

  it("retries the insert when the transient failure happened before commit", async () => {
    const s = store();
    s.failNext("hive3_p2px_worker_put_extraction_batch", "read ECONNRESET", 1);
    const result = await putPackExtractionBatch(s.client, RUN, batch());
    expect(result.inserted).toBe(true);
    expect(s.batchesFor(RUN)).toHaveLength(1);
  });

  it("stops after the bounded inline attempts and surfaces retryable DB_TRANSIENT", async () => {
    const s = store();
    s.failNext("hive3_p2px_worker_put_extraction_batch", "read ECONNRESET", 10);
    const error = await putPackExtractionBatch(s.client, RUN, batch()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PackExtractionPersistenceError);
    expect(error).toMatchObject({ errorCode: ErrorCode.DB_TRANSIENT, retryable: true });
    expect(s.calls.filter((fn) => fn === "hive3_p2px_worker_put_extraction_batch")).toHaveLength(
      MAX_INLINE_DB_TRANSIENT_ATTEMPTS,
    );
  });

  it("does not retry non-transient failures", async () => {
    const s = store();
    s.failNext("hive3_p2px_worker_put_extraction_batch", "batch_invalid", 1);
    await expect(putPackExtractionBatch(s.client, RUN, batch())).rejects.toThrow(/batch_invalid/);
    expect(s.calls.filter((fn) => fn === "hive3_p2px_worker_put_extraction_batch")).toHaveLength(1);
  });
});

describe("putPackExtractionPrompt and ref artifact", () => {
  it("stores the prompt once and pins the ref artifact", async () => {
    const s = store();
    expect(await putPackExtractionPrompt(s.client, { compiled, studyRunId: RUN })).toEqual({ inserted: true });
    expect(await putPackExtractionPrompt(s.client, { compiled, studyRunId: RUN })).toEqual({ inserted: false });
    await putPackExtractionRefArtifact(s.client, { studyRunId: RUN, compiled });
    await putPackExtractionRefArtifact(s.client, { studyRunId: RUN, compiled });
    const artifact = s.artifacts.get(`${RUN}|${PACK_EXTRACTION_REF_ARTIFACT_KIND}|1`);
    expect(artifact?.payload_json).toMatchObject({
      pack_id: "iep",
      pack_version: "2.0.0",
      prompt_digests: [compiled.prompt_digest],
    });
  });

  it("maps a digest collision to a non-retryable EXTRACTION_FAILED", async () => {
    const s = store();
    s.failNext("hive3_p2px_worker_put_extraction_prompt", "prompt_digest_collision", 1);
    await expect(putPackExtractionPrompt(s.client, { compiled, studyRunId: RUN })).rejects.toMatchObject({
      errorCode: ErrorCode.EXTRACTION_FAILED,
      reason: "prompt_digest_collision",
      retryable: false,
    });
  });
});
