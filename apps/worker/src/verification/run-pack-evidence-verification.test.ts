import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorCode } from "@hiveforyou/contracts/errors/v1";

import {
  FakeExtractionStore,
  fakeReader,
  loadIep200,
  readResponse,
  sourceRow,
} from "../pack-extraction/pack-extraction.fixture.js";
import { L001_CORPUS } from "../plan/l001-corpus.fixture.js";
import { putDocumentPagesForSource } from "../persistence/document-pages-persistence.js";
import * as factVerificationPersistence from "../persistence/fact-verification-persistence.js";
import {
  PackEvidenceVerificationError,
  runPackEvidenceVerificationForRun,
} from "./run-pack-evidence-verification.js";

const RUN = "run-verify-1";
const HIVE = "hive-verify-1";

describe("runPackEvidenceVerificationForRun", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persists one verification disposition per accepted candidate", async () => {
    const store = new FakeExtractionStore();
    store.addRun(RUN, HIVE);
    const { bytes: manifestBytes, manifest } = loadIep200();
    const doc = L001_CORPUS[0]!;
    const source = sourceRow(doc, HIVE);
    store.registerSource(source);
    store.sources.set(RUN, [source]);

    const read = readResponse(doc, source);
    await putDocumentPagesForSource(store.client, {
      studyRunId: RUN,
      correlationId: "corr-pages",
      source,
      read,
    });

    store.batches.push({
      id: "batch-1",
      study_run_id: RUN,
      hive_id: HIVE,
      source_document_id: source.source_document_id,
      prompt_digest: "sha256:" + "a".repeat(64),
      page_start: 1,
      source_sha256: source.sha256,
      read_fingerprint: read.read_fingerprint,
      page_set_digest: store.pagesForSource(source.source_document_id)[0]!.page_set_digest,
      pack_id: manifest.pack_id,
      pack_version: manifest.pack_version,
      status: "SUCCEEDED",
      disposition: "VALID",
      accepted_facts_json: [
        {
          record_type_id: "document_header",
          record_local_id: "r1",
          parent_record_local_id: null,
          segment_index: 0,
          fact_id: "document_header.title",
          status: "OBSERVED",
          value: "Title",
          evidence: [{ page_number: 1, exact_quote: doc.pages[0]!.text.split("\n")[0]! }],
        },
        { record_type_id: "document_header", record_local_id: "r1", parent_record_local_id: null, segment_index: 0, fact_id: "document_header.effective_end", status: "NOT_FOUND", evidence: [] },
      ],
    });

    const summary = await runPackEvidenceVerificationForRun(store.client, {
      studyRunId: RUN,
      correlationId: "corr-verify",
      selected: { manifest, manifestBytes, digest: "digest", domainId: "iep" },
    });

    expect(summary.candidate_count).toBe(2);
    expect(store.factVerificationsFor(RUN)).toHaveLength(2);
    expect(summary.verified_count + summary.rejected_count + summary.unresolved_count).toBe(2);
  });

  it("records REJECTED when persisted pages are missing for the batch generation", async () => {
    const store = new FakeExtractionStore();
    store.addRun(RUN, HIVE);
    const { bytes: manifestBytes, manifest } = loadIep200();
    const doc = L001_CORPUS[0]!;
    const source = sourceRow(doc, HIVE);
    store.registerSource(source);

    store.batches.push({
      id: "batch-1",
      study_run_id: RUN,
      hive_id: HIVE,
      source_document_id: source.source_document_id,
      prompt_digest: "sha256:" + "b".repeat(64),
      page_start: 1,
      source_sha256: source.sha256,
      read_fingerprint: "fp-missing",
      page_set_digest: "sha256:" + "c".repeat(64),
      pack_id: manifest.pack_id,
      pack_version: manifest.pack_version,
      status: "SUCCEEDED",
      disposition: "VALID",
      accepted_facts_json: [
        {
          record_type_id: "document_header",
          record_local_id: "r1",
          parent_record_local_id: null,
          segment_index: 0,
          fact_id: "document_header.title",
          status: "OBSERVED",
          value: "Title",
          evidence: [{ page_number: 1, exact_quote: "x" }],
        },
      ],
    });

    const summary = await runPackEvidenceVerificationForRun(store.client, {
      studyRunId: RUN,
      correlationId: "corr-verify",
      selected: { manifest, manifestBytes, digest: "digest", domainId: "iep" },
    });

    expect(summary.rejected_count).toBe(1);
    expect(store.factVerificationsFor(RUN)[0]?.verification_disposition).toBe("REJECTED");
  });

  it("REJECTED when batch page_set_digest is stale relative to persisted pages", async () => {
    const store = new FakeExtractionStore();
    store.addRun(RUN, HIVE);
    const { bytes: manifestBytes, manifest } = loadIep200();
    const doc = L001_CORPUS[0]!;
    const source = sourceRow(doc, HIVE);
    store.registerSource(source);
    const read = readResponse(doc, source);
    await putDocumentPagesForSource(store.client, {
      studyRunId: RUN,
      correlationId: "corr-pages-stale",
      source,
      read,
    });
    const liveDigest = store.pagesForSource(source.source_document_id)[0]!.page_set_digest;
    expect(liveDigest).toBeTruthy();

    store.batches.push({
      id: "batch-stale-digest",
      study_run_id: RUN,
      hive_id: HIVE,
      source_document_id: source.source_document_id,
      prompt_digest: "sha256:" + "e".repeat(64),
      page_start: 1,
      source_sha256: source.sha256,
      read_fingerprint: read.read_fingerprint,
      page_set_digest: `sha256:${"f".repeat(64)}`,
      pack_id: manifest.pack_id,
      pack_version: manifest.pack_version,
      status: "SUCCEEDED",
      disposition: "VALID",
      accepted_facts_json: [
        {
          record_type_id: "document_header",
          record_local_id: "r1",
          parent_record_local_id: null,
          segment_index: 0,
          fact_id: "document_header.title",
          status: "OBSERVED",
          value: doc.pages[0]!.text.split("\n")[0]!,
          evidence: [{ page_number: 1, exact_quote: doc.pages[0]!.text.split("\n")[0]! }],
        },
      ],
    });

    const summary = await runPackEvidenceVerificationForRun(store.client, {
      studyRunId: RUN,
      correlationId: "corr-stale-digest",
      selected: { manifest, manifestBytes, digest: "digest", domainId: "iep" },
    });

    expect(summary.verified_count).toBe(0);
    expect(summary.rejected_count).toBe(1);
    expect(store.factVerificationsFor(RUN)[0]).toMatchObject({
      verification_disposition: "REJECTED",
      verification_reason_code: "pages_not_found",
    });
  });

  it("does not VERIFIED NOT_FOUND candidates without evidence", async () => {
    const store = new FakeExtractionStore();
    store.addRun(RUN, HIVE);
    const { bytes: manifestBytes, manifest } = loadIep200();
    const doc = L001_CORPUS[0]!;
    const source = sourceRow(doc, HIVE);
    store.registerSource(source);
    const read = readResponse(doc, source);
    await putDocumentPagesForSource(store.client, {
      studyRunId: RUN,
      correlationId: "corr-not-found",
      source,
      read,
    });

    store.batches.push({
      id: "batch-not-found",
      study_run_id: RUN,
      hive_id: HIVE,
      source_document_id: source.source_document_id,
      prompt_digest: "sha256:" + "g".repeat(64),
      page_start: 1,
      source_sha256: source.sha256,
      read_fingerprint: read.read_fingerprint,
      page_set_digest: store.pagesForSource(source.source_document_id)[0]!.page_set_digest,
      pack_id: manifest.pack_id,
      pack_version: manifest.pack_version,
      status: "SUCCEEDED",
      disposition: "VALID",
      accepted_facts_json: [
        {
          record_type_id: "document_header",
          record_local_id: "r1",
          parent_record_local_id: null,
          segment_index: 0,
          fact_id: "document_header.effective_end",
          status: "NOT_FOUND",
          evidence: [],
        },
      ],
    });

    const summary = await runPackEvidenceVerificationForRun(store.client, {
      studyRunId: RUN,
      correlationId: "corr-not-found",
      selected: { manifest, manifestBytes, digest: "digest", domainId: "iep" },
    });

    expect(summary.verified_count).toBe(0);
    expect(summary.rejected_count).toBe(1);
    expect(store.factVerificationsFor(RUN)[0]?.verification_disposition).not.toBe("VERIFIED");
  });

  it("scopes listRunBatchesForVerify to the run Hive (no cross-Hive batch leakage)", async () => {
    const otherHive = "hive-other";
    const store = new FakeExtractionStore();
    store.addRun(RUN, HIVE);
    store.addRun("run-other", otherHive);
    const { manifest } = loadIep200();
    const doc = L001_CORPUS[1]!;
    const foreignSource = sourceRow(doc, otherHive);
    store.batches.push({
      id: "foreign-batch",
      study_run_id: "run-other",
      hive_id: otherHive,
      source_document_id: foreignSource.source_document_id,
      prompt_digest: "sha256:" + "h".repeat(64),
      page_start: 1,
      source_sha256: foreignSource.sha256,
      read_fingerprint: "fp-foreign",
      page_set_digest: `sha256:${"i".repeat(64)}`,
      pack_id: manifest.pack_id,
      pack_version: manifest.pack_version,
      status: "SUCCEEDED",
      disposition: "VALID",
      accepted_facts_json: [
        {
          record_type_id: "document_header",
          record_local_id: "r1",
          parent_record_local_id: null,
          segment_index: 0,
          fact_id: "document_header.title",
          status: "OBSERVED",
          value: "Foreign",
          evidence: [{ page_number: 1, exact_quote: "Foreign" }],
        },
      ],
    });

    const summary = await runPackEvidenceVerificationForRun(store.client, {
      studyRunId: RUN,
      correlationId: "corr-cross-hive",
      selected: { manifest, manifestBytes: "{}", digest: "digest", domainId: "iep" },
    });

    expect(summary.batch_count).toBe(0);
    expect(summary.candidate_count).toBe(0);
    expect(store.factVerificationsFor(RUN)).toHaveLength(0);
  });

  it("surfaces partial persistence failure without claiming full coverage", async () => {
    const store = new FakeExtractionStore();
    store.addRun(RUN, HIVE);
    const { bytes: manifestBytes, manifest } = loadIep200();
    const doc = L001_CORPUS[0]!;
    const source = sourceRow(doc, HIVE);
    store.registerSource(source);
    const read = readResponse(doc, source);
    await putDocumentPagesForSource(store.client, {
      studyRunId: RUN,
      correlationId: "corr-partial",
      source,
      read,
    });

    store.batches.push({
      id: "batch-partial",
      study_run_id: RUN,
      hive_id: HIVE,
      source_document_id: source.source_document_id,
      prompt_digest: "sha256:" + "j".repeat(64),
      page_start: 1,
      source_sha256: source.sha256,
      read_fingerprint: read.read_fingerprint,
      page_set_digest: store.pagesForSource(source.source_document_id)[0]!.page_set_digest,
      pack_id: manifest.pack_id,
      pack_version: manifest.pack_version,
      status: "SUCCEEDED",
      disposition: "VALID",
      accepted_facts_json: [
        {
          record_type_id: "document_header",
          record_local_id: "r1",
          parent_record_local_id: null,
          segment_index: 0,
          fact_id: "document_header.title",
          status: "OBSERVED",
          value: doc.pages[0]!.text.split("\n")[0]!,
          evidence: [{ page_number: 1, exact_quote: doc.pages[0]!.text.split("\n")[0]! }],
        },
        {
          record_type_id: "document_header",
          record_local_id: "r1",
          parent_record_local_id: null,
          segment_index: 0,
          fact_id: "document_header.effective_end",
          status: "NOT_FOUND",
          evidence: [],
        },
      ],
    });

    store.failPutFactVerificationAfterPersisted(1);

    await expect(
      runPackEvidenceVerificationForRun(store.client, {
        studyRunId: RUN,
        correlationId: "corr-partial-fail",
        selected: { manifest, manifestBytes, digest: "digest", domainId: "iep" },
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.INVALID_REQUEST, retryable: false });

    expect(store.factVerificationsFor(RUN)).toHaveLength(1);
  });

  it("completes verify after partial fact_invalid (idempotent recovery on persisted L003-style run)", async () => {
    const store = new FakeExtractionStore();
    store.addRun(RUN, HIVE);
    const { bytes: manifestBytes, manifest } = loadIep200();
    const doc = L001_CORPUS[0]!;
    const source = sourceRow(doc, HIVE);
    store.registerSource(source);
    const read = readResponse(doc, source);
    await putDocumentPagesForSource(store.client, {
      studyRunId: RUN,
      correlationId: "corr-l003-recover",
      source,
      read,
    });

    store.batches.push({
      id: "batch-l003-recover",
      study_run_id: RUN,
      hive_id: HIVE,
      source_document_id: source.source_document_id,
      prompt_digest: "sha256:" + "m".repeat(64),
      page_start: 1,
      source_sha256: source.sha256,
      read_fingerprint: read.read_fingerprint,
      page_set_digest: store.pagesForSource(source.source_document_id)[0]!.page_set_digest,
      pack_id: manifest.pack_id,
      pack_version: manifest.pack_version,
      status: "SUCCEEDED",
      disposition: "VALID",
      accepted_facts_json: [
        {
          record_type_id: "document_header",
          record_local_id: "r1",
          parent_record_local_id: null,
          segment_index: 0,
          fact_id: "document_header.title",
          status: "OBSERVED",
          value: doc.pages[0]!.text.split("\n")[0]!,
          evidence: [{ page_number: 1, exact_quote: doc.pages[0]!.text.split("\n")[0]! }],
        },
        {
          record_type_id: "document_header",
          record_local_id: "r1",
          parent_record_local_id: null,
          segment_index: 0,
          fact_id: "document_header.effective_end",
          status: "NOT_FOUND",
          evidence: [],
        },
      ],
    });

    store.failPutFactVerificationAfterPersisted(1, "fact_invalid");

    await expect(
      runPackEvidenceVerificationForRun(store.client, {
        studyRunId: RUN,
        correlationId: "corr-l003-recover-fail",
        selected: { manifest, manifestBytes, digest: "digest", domainId: "iep" },
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.INVALID_REQUEST, reason: "fact_invalid" });

    expect(store.factVerificationsFor(RUN)).toHaveLength(1);

    store.clearPutFactVerificationFailure();

    const summary = await runPackEvidenceVerificationForRun(store.client, {
      studyRunId: RUN,
      correlationId: "corr-l003-recover-retry",
      selected: { manifest, manifestBytes, digest: "digest", domainId: "iep" },
    });

    expect(summary.candidate_count).toBe(2);
    expect(store.factVerificationsFor(RUN)).toHaveLength(2);
    expect(store.factVerificationsFor(RUN)[1]).toMatchObject({
      verification_disposition: "REJECTED",
      verification_reason_code: "status_requires_evidence",
    });
  });

  it("is idempotent on duplicate verify retries (same dispositions, no duplicate rows)", async () => {
    const store = new FakeExtractionStore();
    store.addRun(RUN, HIVE);
    const { bytes: manifestBytes, manifest } = loadIep200();
    const doc = L001_CORPUS[0]!;
    const source = sourceRow(doc, HIVE);
    store.registerSource(source);
    const read = readResponse(doc, source);
    await putDocumentPagesForSource(store.client, {
      studyRunId: RUN,
      correlationId: "corr-idempotent",
      source,
      read,
    });

    store.batches.push({
      id: "batch-idempotent",
      study_run_id: RUN,
      hive_id: HIVE,
      source_document_id: source.source_document_id,
      prompt_digest: "sha256:" + "k".repeat(64),
      page_start: 1,
      source_sha256: source.sha256,
      read_fingerprint: read.read_fingerprint,
      page_set_digest: store.pagesForSource(source.source_document_id)[0]!.page_set_digest,
      pack_id: manifest.pack_id,
      pack_version: manifest.pack_version,
      status: "SUCCEEDED",
      disposition: "VALID",
      accepted_facts_json: [
        {
          record_type_id: "document_header",
          record_local_id: "r1",
          parent_record_local_id: null,
          segment_index: 0,
          fact_id: "document_header.title",
          status: "OBSERVED",
          value: doc.pages[0]!.text.split("\n")[0]!,
          evidence: [{ page_number: 1, exact_quote: doc.pages[0]!.text.split("\n")[0]! }],
        },
      ],
    });

    const input = {
      studyRunId: RUN,
      correlationId: "corr-idempotent",
      selected: { manifest, manifestBytes, digest: "digest", domainId: "iep" as const },
    };
    await runPackEvidenceVerificationForRun(store.client, input);
    const afterFirst = store.factVerificationsFor(RUN).length;
    const putCallsAfterFirst = store.calls.filter((fn) => fn === "hive3_p23_worker_put_fact_verification").length;

    await runPackEvidenceVerificationForRun(store.client, input);
    expect(store.factVerificationsFor(RUN)).toHaveLength(afterFirst);
    expect(store.calls.filter((fn) => fn === "hive3_p23_worker_put_fact_verification")).toHaveLength(
      putCallsAfterFirst * 2,
    );
  });

  it("fails closed when post-run fact counts do not match candidates (incomplete verification)", async () => {
    const store = new FakeExtractionStore();
    store.addRun(RUN, HIVE);
    const { bytes: manifestBytes, manifest } = loadIep200();
    const doc = L001_CORPUS[0]!;
    const source = sourceRow(doc, HIVE);
    store.registerSource(source);
    const read = readResponse(doc, source);
    await putDocumentPagesForSource(store.client, {
      studyRunId: RUN,
      correlationId: "corr-incomplete",
      source,
      read,
    });

    store.batches.push({
      id: "batch-incomplete",
      study_run_id: RUN,
      hive_id: HIVE,
      source_document_id: source.source_document_id,
      prompt_digest: "sha256:" + "l".repeat(64),
      page_start: 1,
      source_sha256: source.sha256,
      read_fingerprint: read.read_fingerprint,
      page_set_digest: store.pagesForSource(source.source_document_id)[0]!.page_set_digest,
      pack_id: manifest.pack_id,
      pack_version: manifest.pack_version,
      status: "SUCCEEDED",
      disposition: "VALID",
      accepted_facts_json: [
        {
          record_type_id: "document_header",
          record_local_id: "r1",
          parent_record_local_id: null,
          segment_index: 0,
          fact_id: "document_header.title",
          status: "OBSERVED",
          value: doc.pages[0]!.text.split("\n")[0]!,
          evidence: [{ page_number: 1, exact_quote: doc.pages[0]!.text.split("\n")[0]! }],
        },
      ],
    });

    const countSpy = vi.spyOn(factVerificationPersistence, "countFactVerifications").mockResolvedValueOnce({
      total: 0,
      verified: 0,
      rejected: 0,
      unresolved: 0,
    });

    await expect(
      runPackEvidenceVerificationForRun(store.client, {
        studyRunId: RUN,
        correlationId: "corr-incomplete",
        selected: { manifest, manifestBytes, digest: "digest", domainId: "iep" },
      }),
    ).rejects.toBeInstanceOf(PackEvidenceVerificationError);

    countSpy.mockRestore();
  });
});
