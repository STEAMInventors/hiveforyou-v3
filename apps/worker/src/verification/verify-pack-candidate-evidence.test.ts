import { describe, expect, it } from "vitest";

import {
  FakeExtractionStore,
  loadIep200,
  readResponse,
  sourceRow,
} from "../pack-extraction/pack-extraction.fixture.js";
import type { AcceptedPackFactV1 } from "../pack-extraction/validate-extraction.js";
import {
  listDocumentPagesForSource,
  prepareDocumentPagesForInsert,
  putDocumentPagesForSource,
} from "../persistence/document-pages-persistence.js";
import { L001_CORPUS } from "../plan/l001-corpus.fixture.js";
import { verifyPackCandidateEvidence } from "./verify-pack-candidate-evidence.js";

const RUN = "run-verify-1";
const HIVE = "hive-verify";

describe("verifyPackCandidateEvidence — persisted pages", () => {
  const { compiled } = loadIep200();

  it("VERIFIED using pages loaded from the fake store, not extract-time pageText", async () => {
    const doc = L001_CORPUS[7]!;
    const source = sourceRow(doc, HIVE);
    const read = readResponse(doc, source);
    const prepared = prepareDocumentPagesForInsert({ source, read });
    const store = new FakeExtractionStore();
    store.addRun(RUN, HIVE);
    store.registerSource(source);

    await putDocumentPagesForSource(store.client, {
      studyRunId: RUN,
      correlationId: "corr-verify",
      source,
      read,
    });

    const loaded = await listDocumentPagesForSource(store.client, {
      studyRunId: RUN,
      sourceDocumentId: source.source_document_id,
      readFingerprint: prepared.readFingerprint,
      pageSetDigest: prepared.pageSetDigest,
      expectedHiveId: HIVE,
      expectedSourceSha256: prepared.sourceSha256,
    });

    const fact: AcceptedPackFactV1 = {
      record_type_id: "document_header",
      record_local_id: "hdr-1",
      parent_record_local_id: null,
      segment_index: 0,
      fact_id: "document_header.title",
      status: "OBSERVED",
      value: doc.pages[0]!.text.split("\n")[0]!,
      evidence: [{ page_number: 1, exact_quote: doc.pages[0]!.text.split("\n")[0]! }],
    };

    const result = verifyPackCandidateEvidence({
      expected: {
        hive_id: HIVE,
        source_document_id: source.source_document_id,
        source_sha256: prepared.sourceSha256,
        read_fingerprint: prepared.readFingerprint,
        page_set_digest: prepared.pageSetDigest,
      },
      persistedPages: loaded,
      fact,
      catalog: compiled.catalog.catalog,
    });

    expect(result.disposition).toBe("VERIFIED");
  });

  it("REJECTED when evidence matches extract memory but not persisted page text", async () => {
    const doc = L001_CORPUS[7]!;
    const source = sourceRow(doc, HIVE);
    const read = readResponse(doc, source);
    const prepared = prepareDocumentPagesForInsert({ source, read });
    const store = new FakeExtractionStore();
    store.addRun(RUN, HIVE);
    store.registerSource(source);

    await putDocumentPagesForSource(store.client, {
      studyRunId: RUN,
      correlationId: "corr-verify-2",
      source,
      read,
    });

    const loaded = await listDocumentPagesForSource(store.client, {
      studyRunId: RUN,
      sourceDocumentId: source.source_document_id,
      readFingerprint: prepared.readFingerprint,
      pageSetDigest: prepared.pageSetDigest,
      expectedHiveId: HIVE,
      expectedSourceSha256: prepared.sourceSha256,
    });

    const fact: AcceptedPackFactV1 = {
      record_type_id: "document_header",
      record_local_id: "hdr-1",
      parent_record_local_id: null,
      segment_index: 0,
      fact_id: "document_header.title",
      status: "OBSERVED",
      value: "Only in extract memory",
      evidence: [{ page_number: 1, exact_quote: "Only in extract memory" }],
    };

    const result = verifyPackCandidateEvidence({
      expected: {
        hive_id: HIVE,
        source_document_id: source.source_document_id,
        source_sha256: prepared.sourceSha256,
        read_fingerprint: prepared.readFingerprint,
        page_set_digest: prepared.pageSetDigest,
      },
      persistedPages: loaded,
      fact,
      catalog: compiled.catalog.catalog,
    });

    expect(result).toMatchObject({ disposition: "REJECTED", reason_code: "QUOTE_NOT_IN_PAGE" });
  });

  it("REJECTED when expected Hive does not match persisted pages", async () => {
    const doc = L001_CORPUS[7]!;
    const source = sourceRow(doc, HIVE);
    const read = readResponse(doc, source);
    const prepared = prepareDocumentPagesForInsert({ source, read });
    const store = new FakeExtractionStore();
    store.addRun(RUN, HIVE);
    store.registerSource(source);

    await putDocumentPagesForSource(store.client, {
      studyRunId: RUN,
      correlationId: "corr-verify-3",
      source,
      read,
    });

    const loaded = await listDocumentPagesForSource(store.client, {
      studyRunId: RUN,
      sourceDocumentId: source.source_document_id,
      readFingerprint: prepared.readFingerprint,
      pageSetDigest: prepared.pageSetDigest,
      expectedHiveId: HIVE,
      expectedSourceSha256: prepared.sourceSha256,
    });

    const result = verifyPackCandidateEvidence({
      expected: {
        hive_id: "hive-other",
        source_document_id: source.source_document_id,
        source_sha256: prepared.sourceSha256,
        read_fingerprint: prepared.readFingerprint,
        page_set_digest: prepared.pageSetDigest,
      },
      persistedPages: loaded,
      fact: {
        record_type_id: "document_header",
        record_local_id: "hdr-1",
        parent_record_local_id: null,
        segment_index: 0,
        fact_id: "document_header.title",
        status: "NOT_FOUND",
        evidence: [],
      },
      catalog: compiled.catalog.catalog,
    });

    expect(result).toMatchObject({ disposition: "REJECTED", reason_code: "SOURCE_HIVE_MISMATCH" });
  });
});
