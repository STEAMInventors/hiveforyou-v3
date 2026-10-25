import { ErrorCode } from "@hiveforyou/contracts/errors/v1";
import { EVIDENCE_VERIFIER_VERSION } from "@hiveforyou/contracts/evidence-verification/v1";
import { computePackCandidateKey } from "@hiveforyou/core";

import { compilePackSystemPrompt } from "../pack-extraction/compile-system-prompt.js";
import type { SelectedPack } from "../pack-extraction/run-pack-extraction.js";
import type { AcceptedPackFactV1 } from "../pack-extraction/validate-extraction.js";
import { listDocumentPagesForSource } from "../persistence/document-pages-persistence.js";
import {
  countFactVerifications,
  listRunBatchesForVerify,
  putFactVerification,
  FactVerificationPersistenceError,
} from "../persistence/fact-verification-persistence.js";
import type { StudyRunPersistenceClient } from "../persistence/study-run-persistence.js";

import { verifyPackCandidateEvidence } from "./verify-pack-candidate-evidence.js";

export type PackEvidenceVerificationSummaryV1 = {
  batch_count: number;
  candidate_count: number;
  persisted_count: number;
  verified_count: number;
  rejected_count: number;
  unresolved_count: number;
};

export class PackEvidenceVerificationError extends Error {
  constructor(
    readonly errorCode: string,
    readonly messageSafe: string,
    readonly retryable: boolean,
    readonly reason: string,
  ) {
    super(messageSafe);
    this.name = "PackEvidenceVerificationError";
  }
}

function pageIdByNumber(
  pages: Array<{ id?: string; page_number: number }>,
): Map<number, string | null> {
  const map = new Map<number, string | null>();
  for (const page of pages) {
    map.set(page.page_number, page.id ?? null);
  }
  return map;
}

function buildEvidenceRows(
  fact: AcceptedPackFactV1,
  pageIds: Map<number, string | null>,
): Array<{
  anchor_index: number;
  page_number: number;
  exact_quote: string | null;
  document_page_id: string | null;
}> {
  return fact.evidence.map((anchor, anchorIndex) => ({
    anchor_index: anchorIndex,
    page_number: anchor.page_number,
    exact_quote: anchor.exact_quote,
    document_page_id: pageIds.get(anchor.page_number) ?? null,
  }));
}

/**
 * Independent evidence verification for all accepted candidates in a study run (selected-Pack path).
 * Loads persisted pages from PostgreSQL; does not use extract-time Reader memory.
 */
export async function runPackEvidenceVerificationForRun(
  client: StudyRunPersistenceClient,
  input: {
    studyRunId: string;
    correlationId: string;
    selected: SelectedPack;
  },
): Promise<PackEvidenceVerificationSummaryV1> {
  const compiled = compilePackSystemPrompt(input.selected.manifest, {
    manifestBytes: input.selected.manifestBytes,
  });
  const catalog = compiled.catalog.catalog;

  const batches = await listRunBatchesForVerify(client, input.studyRunId);
  let candidateCount = 0;
  let persistedCount = 0;
  let verifiedCount = 0;
  let rejectedCount = 0;
  let unresolvedCount = 0;

  for (const batch of batches) {
    if (!batch.page_set_digest?.trim()) {
      throw new PackEvidenceVerificationError(
        ErrorCode.COVERAGE_INCOMPLETE,
        "Document pages were not available for verification.",
        false,
        "missing_page_set_digest",
      );
    }

    const pagesOutcome = await listDocumentPagesForSource(client, {
      studyRunId: input.studyRunId,
      sourceDocumentId: batch.source_document_id,
      readFingerprint: batch.read_fingerprint,
      pageSetDigest: batch.page_set_digest,
      expectedSourceSha256: batch.source_sha256,
    });

    const pageIds = pageIdByNumber(pagesOutcome.pages);

    for (const fact of batch.accepted_facts_json) {
      candidateCount += 1;
      const verification = verifyPackCandidateEvidence({
        expected: {
          hive_id: pagesOutcome.hive_id,
          source_document_id: batch.source_document_id,
          source_sha256: batch.source_sha256,
          read_fingerprint: batch.read_fingerprint,
          page_set_digest: batch.page_set_digest,
        },
        persistedPages: pagesOutcome,
        fact,
        catalog,
      });

      if (verification.disposition === "VERIFIED") verifiedCount += 1;
      else if (verification.disposition === "REJECTED") rejectedCount += 1;
      else unresolvedCount += 1;

      const candidateKey = computePackCandidateKey({
        record_type_id: fact.record_type_id,
        record_local_id: fact.record_local_id,
        parent_record_local_id: fact.parent_record_local_id,
        segment_index: fact.segment_index,
        fact_id: fact.fact_id,
      });

      await putFactVerification(client, input.studyRunId, {
        origin_batch_id: batch.batch_id,
        source_document_id: batch.source_document_id,
        candidate_key: candidateKey,
        pack_id: batch.pack_id,
        pack_version: batch.pack_version,
        record_type_id: fact.record_type_id,
        record_local_id: fact.record_local_id,
        parent_record_local_id: fact.parent_record_local_id,
        segment_index: fact.segment_index,
        fact_id: fact.fact_id,
        candidate_status: fact.status,
        value_json: fact.value ?? null,
        source_sha256: batch.source_sha256,
        read_fingerprint: batch.read_fingerprint,
        page_set_digest: batch.page_set_digest,
        verification_disposition: verification.disposition,
        verification_reason_code: verification.reason_code,
        verifier_version: EVIDENCE_VERIFIER_VERSION,
        evidence_anchors_verified: verification.evidence_anchors_verified,
        evidence: buildEvidenceRows(fact, pageIds),
      });
      persistedCount += 1;
    }
  }

  const counts = await countFactVerifications(client, input.studyRunId);
  if (counts.total !== candidateCount || persistedCount !== candidateCount) {
    throw new PackEvidenceVerificationError(
      ErrorCode.COVERAGE_INCOMPLETE,
      "Not every extraction candidate received a verification disposition.",
      false,
      "verification_incomplete",
    );
  }

  console.info(
    JSON.stringify({
      event: "pack_evidence_verification_run_summary",
      study_run_id: input.studyRunId,
      correlation_id: input.correlationId,
      batch_count: batches.length,
      candidate_count: candidateCount,
      verified_count: verifiedCount,
      rejected_count: rejectedCount,
      unresolved_count: unresolvedCount,
      persisted_total: counts.total,
    }),
  );

  return {
    batch_count: batches.length,
    candidate_count: candidateCount,
    persisted_count: persistedCount,
    verified_count: verifiedCount,
    rejected_count: rejectedCount,
    unresolved_count: unresolvedCount,
  };
}

export function packEvidenceVerificationErrorFrom(error: unknown): PackEvidenceVerificationError | null {
  if (error instanceof PackEvidenceVerificationError) return error;
  if (error instanceof FactVerificationPersistenceError) {
    return new PackEvidenceVerificationError(
      error.errorCode,
      error.message,
      error.retryable,
      error.reason,
    );
  }
  return null;
}
