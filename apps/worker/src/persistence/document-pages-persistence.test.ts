import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorCode } from "@hiveforyou/contracts/errors/v1";
import type { ReaderReadDocumentResponseV1 } from "@hiveforyou/contracts/reader/v1";

import {
  FakeExtractionStore,
  readResponse,
  sha256Hex,
  sourceRow,
} from "../pack-extraction/pack-extraction.fixture.js";
import { L001_CORPUS } from "../plan/l001-corpus.fixture.js";
import { MAX_INLINE_DB_TRANSIENT_ATTEMPTS } from "./pack-extraction-persistence.js";
import {
  DOCUMENT_PAGE_PROVENANCE_VERSION,
  DocumentPagesPersistenceError,
  listDocumentPagesForSource,
  MAX_DOCUMENT_PAGE_TEXT_BYTES,
  prepareDocumentPagesForInsert,
  putDocumentPagesForSource,
} from "./document-pages-persistence.js";

const RUN = "run-1";
const RUN_2 = "run-2";
const HIVE = "hive-1";
const OTHER_HIVE = "hive-2";

let logLines: string[];

beforeEach(() => {
  logLines = [];
  vi.spyOn(console, "info").mockImplementation((line: string) => void logLines.push(line));
  vi.spyOn(console, "error").mockImplementation((line: string) => void logLines.push(line));
});

afterEach(() => {
  vi.restoreAllMocks();
});

function fixtureDoc() {
  const doc = L001_CORPUS[7]!; // 2-page IEP plan document
  const source = sourceRow(doc, HIVE);
  const read = readResponse(doc, source);
  const prepared = prepareDocumentPagesForInsert({ source, read });
  const store = new FakeExtractionStore();
  store.addRun(RUN, HIVE);
  store.addRun(RUN_2, HIVE);
  store.registerSource(source);
  return { doc, source, read, prepared, store };
}

function listArgs(
  prepared: ReturnType<typeof prepareDocumentPagesForInsert>,
  sourceDocumentId: string,
  studyRunId: string,
) {
  return {
    studyRunId,
    sourceDocumentId,
    readFingerprint: prepared.readFingerprint,
    pageSetDigest: prepared.pageSetDigest,
    expectedHiveId: HIVE,
    expectedSourceSha256: prepared.sourceSha256,
  };
}

describe("putDocumentPagesForSource & listDocumentPagesForSource", () => {
  it("persists multi-page Reader output with SHA-256 lineage, fingerprint and provenance, then reads it back independently", async () => {
    const { doc, source, read, prepared, store } = fixtureDoc();

    const putResult = await putDocumentPagesForSource(store.client, {
      studyRunId: RUN,
      correlationId: "corr-1",
      source,
      read,
    });

    expect(putResult).toEqual({
      source_document_id: source.source_document_id,
      hive_id: HIVE,
      source_sha256: source.sha256,
      read_fingerprint: read.read_fingerprint,
      page_set_digest: prepared.pageSetDigest,
      page_count: 2,
      inserted_count: 2,
      replayed_count: 0,
    });

    const loaded = await listDocumentPagesForSource(store.client, listArgs(prepared, source.source_document_id, RUN_2));

    expect(loaded.found).toBe(true);
    expect(loaded.pages).toHaveLength(2);
    expect(loaded.pages.map((p) => p.page_number)).toEqual([1, 2]);
    for (let i = 0; i < doc.pages.length; i += 1) {
      const page = loaded.pages[i]!;
      const expectedText = doc.pages[i]!.text;
      expect(page).toMatchObject({
        hive_id: HIVE,
        source_document_id: source.source_document_id,
        first_study_run_id: RUN,
        source_sha256: source.sha256,
        read_fingerprint: read.read_fingerprint,
        page_set_digest: prepared.pageSetDigest,
        page_count: 2,
        page_number: i + 1,
        page_text: expectedText,
        page_text_sha256: `sha256:${sha256Hex(expectedText)}`,
        page_byte_length: Buffer.byteLength(expectedText, "utf8"),
        extraction_method: "pdf_native",
        extraction_status: "SUCCEEDED",
      });
      expect(page.provenance_json).toMatchObject({
        contract_version: DOCUMENT_PAGE_PROVENANCE_VERSION,
        reader_contract_version: "reader-document-read@1",
        quality: { character_count: expectedText.length, identity_text_sufficient: true, issues: [] },
      });
    }
  });

  it("is idempotent across repeated writes on the same run or subsequent runs with identical content", async () => {
    const { source, read, store } = fixtureDoc();

    const first = await putDocumentPagesForSource(store.client, {
      studyRunId: RUN,
      correlationId: "corr-1",
      source,
      read,
    });
    const second = await putDocumentPagesForSource(store.client, {
      studyRunId: RUN,
      correlationId: "corr-1",
      source,
      read,
    });
    const third = await putDocumentPagesForSource(store.client, {
      studyRunId: RUN_2,
      correlationId: "corr-2",
      source,
      read,
    });

    expect(first).toMatchObject({ inserted_count: 2, replayed_count: 0 });
    expect(second).toMatchObject({ inserted_count: 0, replayed_count: 2 });
    expect(third).toMatchObject({ inserted_count: 0, replayed_count: 2 });
    expect(store.pagesForSource(source.source_document_id)).toHaveLength(2);
    expect(store.pagesForSource(source.source_document_id)[0]?.first_study_run_id).toBe(RUN);
  });

  it("stores a new immutable generation on re-read with different page text without overwriting the prior generation", async () => {
    const { source, read, prepared, store } = fixtureDoc();
    await putDocumentPagesForSource(store.client, {
      studyRunId: RUN,
      correlationId: "corr-1",
      source,
      read,
    });

    const mutatedText: ReaderReadDocumentResponseV1 = {
      ...read,
      pages: read.pages.map((p, idx) => (idx === 0 ? { ...p, text: `${p.text} tampered` } : p)),
    };
    const secondPut = await putDocumentPagesForSource(store.client, {
      studyRunId: RUN_2,
      correlationId: "corr-2",
      source,
      read: mutatedText,
    });
    expect(secondPut.inserted_count).toBe(2);
    expect(store.pagesForSource(source.source_document_id)).toHaveLength(4);

    const original = await listDocumentPagesForSource(
      store.client,
      listArgs(prepared, source.source_document_id, RUN),
    );
    expect(original.pages[0]?.page_text).toBe(read.pages[0]?.text);

    const rePrepared = prepareDocumentPagesForInsert({ source, read: mutatedText });
    const updated = await listDocumentPagesForSource(
      store.client,
      listArgs(rePrepared, source.source_document_id, RUN_2),
    );
    expect(updated.pages[0]?.page_text).toBe(mutatedText.pages[0]?.text);
  });

  it("rejects conflicting retries within the same generation (same page-set digest, mismatched read fingerprint)", async () => {
    const { source, read, store } = fixtureDoc();
    await putDocumentPagesForSource(store.client, {
      studyRunId: RUN,
      correlationId: "corr-1",
      source,
      read,
    });

    const mutatedFpSameText: ReaderReadDocumentResponseV1 = {
      ...read,
      read_fingerprint: `sha256:${"f".repeat(64)}`,
    };
    await expect(
      putDocumentPagesForSource(store.client, {
        studyRunId: RUN_2,
        correlationId: "corr-2",
        source,
        read: mutatedFpSameText,
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.INVALID_REQUEST,
      reason: "page_hash_conflict",
      retryable: false,
    });
  });

  it("returns not-found for list when read fingerprint or page-set digest does not match a persisted generation", async () => {
    const { source, read, prepared, store } = fixtureDoc();
    await putDocumentPagesForSource(store.client, {
      studyRunId: RUN,
      correlationId: "corr-1",
      source,
      read,
    });

    const wrongDigest = await listDocumentPagesForSource(store.client, {
      ...listArgs(prepared, source.source_document_id, RUN),
      pageSetDigest: `sha256:${"0".repeat(64)}`,
    });
    expect(wrongDigest.found).toBe(false);
    expect(wrongDigest.pages).toHaveLength(0);

    const wrongFp = await listDocumentPagesForSource(store.client, {
      ...listArgs(prepared, source.source_document_id, RUN),
      readFingerprint: "wrong-fingerprint",
    });
    expect(wrongFp.found).toBe(false);
  });

  it("denies cross-Hive writes and reads (wrong Hive or mismatched Reader source identity)", async () => {
    const { source, read, prepared, store } = fixtureDoc();
    store.addRun("run-other-hive", OTHER_HIVE);

    // Run belongs to OTHER_HIVE while registered source belongs to HIVE
    await expect(
      putDocumentPagesForSource(store.client, {
        studyRunId: "run-other-hive",
        correlationId: "corr-x",
        source,
        read,
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.ACCESS_DENIED,
      reason: "page_hive_mismatch",
      retryable: false,
    });

    // Reader response claims a different hive_id or source_document_id than the registered source
    await expect(
      putDocumentPagesForSource(store.client, {
        studyRunId: RUN,
        correlationId: "corr-1",
        source,
        read: { ...read, source: { ...read.source, hive_id: OTHER_HIVE } },
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.ACCESS_DENIED,
      reason: "page_hive_mismatch",
      retryable: false,
    });

    await expect(
      putDocumentPagesForSource(store.client, {
        studyRunId: RUN,
        correlationId: "corr-1",
        source,
        read: { ...read, source: { ...read.source, source_document_id: "wrong-doc-id" } },
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.ACCESS_DENIED,
      reason: "page_hive_mismatch",
      retryable: false,
    });

    // Persist validly on HIVE, then attempt cross-Hive read from OTHER_HIVE run
    await putDocumentPagesForSource(store.client, {
      studyRunId: RUN,
      correlationId: "corr-1",
      source,
      read,
    });
    await expect(
      listDocumentPagesForSource(
        store.client,
        listArgs(prepared, source.source_document_id, "run-other-hive"),
      ),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.ACCESS_DENIED,
      reason: "page_hive_mismatch",
      retryable: false,
    });
  });

  it("rejects source SHA-256 mismatch, unverified source hash, or blank/oversized read fingerprint", async () => {
    const { source, read, store } = fixtureDoc();

    await expect(
      putDocumentPagesForSource(store.client, {
        studyRunId: RUN,
        correlationId: "corr-1",
        source,
        read: { ...read, source: { ...read.source, sha256: "b".repeat(64) } },
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.INVALID_REQUEST,
      reason: "page_source_sha256_mismatch",
      retryable: false,
    });

    await expect(
      putDocumentPagesForSource(store.client, {
        studyRunId: RUN,
        correlationId: "corr-1",
        source,
        read: { ...read, source_hash_verified: false },
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.INVALID_REQUEST,
      reason: "page_source_sha256_mismatch",
      retryable: false,
    });

    await expect(
      putDocumentPagesForSource(store.client, {
        studyRunId: RUN,
        correlationId: "corr-1",
        source,
        read: { ...read, read_fingerprint: "   " },
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.INVALID_REQUEST,
      reason: "page_read_fingerprint_invalid",
      retryable: false,
    });
  });

  it("rejects missing, zero, non-contiguous or duplicate page numbering", async () => {
    const { source, read, store } = fixtureDoc();

    // Empty pages
    await expect(
      putDocumentPagesForSource(store.client, {
        studyRunId: RUN,
        correlationId: "corr-1",
        source,
        read: { ...read, page_count: 0, pages: [] },
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.INVALID_REQUEST,
      reason: "page_numbering_invalid",
      retryable: false,
    });

    // Mismatched page_count vs pages.length
    await expect(
      putDocumentPagesForSource(store.client, {
        studyRunId: RUN,
        correlationId: "corr-1",
        source,
        read: { ...read, page_count: 3 },
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.INVALID_REQUEST,
      reason: "page_numbering_invalid",
      retryable: false,
    });

    // Non-contiguous page numbers (1, 3)
    await expect(
      putDocumentPagesForSource(store.client, {
        studyRunId: RUN,
        correlationId: "corr-1",
        source,
        read: {
          ...read,
          pages: [read.pages[0]!, { ...read.pages[1]!, page_number: 3 }],
        },
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.INVALID_REQUEST,
      reason: "page_numbering_invalid",
      retryable: false,
    });

    // Duplicate page numbers (1, 1)
    await expect(
      putDocumentPagesForSource(store.client, {
        studyRunId: RUN,
        correlationId: "corr-1",
        source,
        read: {
          ...read,
          pages: [read.pages[0]!, { ...read.pages[1]!, page_number: 1 }],
        },
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.INVALID_REQUEST,
      reason: "page_numbering_invalid",
      retryable: false,
    });
  });

  it("fails explicitly on oversized page text (> 64 KiB) with EXTRACTION_FAILED / payload_too_large and never truncates", async () => {
    const { source, read, store } = fixtureDoc();
    const oversizedText = "A".repeat(MAX_DOCUMENT_PAGE_TEXT_BYTES + 1);

    await expect(
      putDocumentPagesForSource(store.client, {
        studyRunId: RUN,
        correlationId: "corr-1",
        source,
        read: {
          ...read,
          pages: [{ ...read.pages[0]!, text: oversizedText }, read.pages[1]!],
        },
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.EXTRACTION_FAILED,
      reason: "payload_too_large",
      retryable: false,
    });

    expect(store.pagesForSource(source.source_document_id)).toHaveLength(0);
  });

  it("recovers from a lost response after commit by reading back persisted pages before retrying", async () => {
    const { source, read, store } = fixtureDoc();
    store.failNext("hive3_p23_worker_put_document_pages", "TypeError: fetch failed", 1, true);

    const outcome = await putDocumentPagesForSource(store.client, {
      studyRunId: RUN,
      correlationId: "corr-1",
      source,
      read,
    });

    expect(outcome).toMatchObject({
      page_count: 2,
      inserted_count: 0,
      replayed_count: 2,
    });
    expect(store.pagesForSource(source.source_document_id)).toHaveLength(2);
  });

  it("retries pre-commit DB_TRANSIENT up to MAX_INLINE_DB_TRANSIENT_ATTEMPTS and surfaces retryable DB_TRANSIENT when exhausted", async () => {
    const { source, read, store } = fixtureDoc();
    store.failNext("hive3_p23_worker_put_document_pages", "read ECONNRESET", 1);

    const recovered = await putDocumentPagesForSource(store.client, {
      studyRunId: RUN,
      correlationId: "corr-1",
      source,
      read,
    });
    expect(recovered.inserted_count).toBe(2);

    const { source: source2, read: read2, store: store2 } = fixtureDoc();
    store2.failNext("hive3_p23_worker_put_document_pages", "read ECONNRESET", 10);
    const err = await putDocumentPagesForSource(store2.client, {
      studyRunId: RUN,
      correlationId: "corr-1",
      source: source2,
      read: read2,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(DocumentPagesPersistenceError);
    expect(err).toMatchObject({
      errorCode: ErrorCode.DB_TRANSIENT,
      reason: "db_transient",
      retryable: true,
    });
    expect(store2.calls.filter((fn) => fn === "hive3_p23_worker_put_document_pages")).toHaveLength(
      MAX_INLINE_DB_TRANSIENT_ATTEMPTS,
    );
  });

  it("detects corrupted persisted page text digest on read (artifact_hash_mismatch)", async () => {
    const { source, read, prepared, store } = fixtureDoc();
    await putDocumentPagesForSource(store.client, {
      studyRunId: RUN,
      correlationId: "corr-1",
      source,
      read,
    });

    // Tamper with stored page text in DB without updating page_text_sha256
    const stored = store.pagesForSource(source.source_document_id);
    stored[0]!.page_text = "corrupted in storage";

    await expect(
      listDocumentPagesForSource(store.client, listArgs(prepared, source.source_document_id, RUN)),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.EXTRACTION_FAILED,
      reason: "artifact_hash_mismatch",
      retryable: false,
    });
  });

  it("logs correlation_id, study_run_id, source_document_id, stage, counts and error codes without page text or filenames", async () => {
    const { source, read, store } = fixtureDoc();
    await putDocumentPagesForSource(store.client, {
      studyRunId: RUN,
      correlationId: "corr-log-check",
      source,
      read,
    });

    expect(logLines).toHaveLength(1);
    const parsed = JSON.parse(logLines[0]!) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      service: "worker",
      stage: "extract",
      event: "document_pages_persistence",
      correlation_id: "corr-log-check",
      study_run_id: RUN,
      source_document_id: source.source_document_id,
      outcome: "pages_persisted",
      page_count: 2,
      inserted_count: 2,
      replayed_count: 0,
    });
    const rawLog = logLines.join("\n");
    expect(rawLog).not.toContain(source.filename);
    for (const page of read.pages) {
      expect(rawLog).not.toContain(page.text);
    }
  });
});
