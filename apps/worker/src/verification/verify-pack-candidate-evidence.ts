import type { EvidenceVerificationV1 } from "@hiveforyou/contracts/evidence-verification/v1";
import {
  verifyCandidateFactEvidence,
  type ExpectedSourceEvidenceContextV1,
  type PackFactCatalogBody,
  type PersistedPageCorpusV1,
} from "@hiveforyou/core";

import type { AcceptedPackFactV1 } from "../pack-extraction/validate-extraction.js";
import type { ListDocumentPagesOutcome } from "../persistence/document-pages-persistence.js";

export type VerifyPackCandidateEvidenceInput = {
  expected: ExpectedSourceEvidenceContextV1;
  persistedPages: ListDocumentPagesOutcome;
  fact: AcceptedPackFactV1;
  catalog: PackFactCatalogBody;
};

function resolveValueKind(catalog: PackFactCatalogBody, fact: AcceptedPackFactV1): string | undefined {
  for (const recordType of catalog.record_types) {
    if (recordType.record_type_id !== fact.record_type_id) {
      continue;
    }
    const match = recordType.facts.find((entry) => entry.fact_id === fact.fact_id);
    return match?.value_kind;
  }
  return undefined;
}

export function listDocumentPagesToCorpus(outcome: ListDocumentPagesOutcome): PersistedPageCorpusV1 {
  return {
    hive_id: outcome.hive_id,
    source_document_id: outcome.source_document_id,
    source_sha256: outcome.source_sha256,
    read_fingerprint: outcome.read_fingerprint,
    page_set_digest: outcome.page_set_digest,
    pages: outcome.pages.map((page) => ({
      page_number: page.page_number,
      page_text: page.page_text,
      page_text_sha256: page.page_text_sha256,
    })),
  };
}

/**
 * Verify one accepted Pack extraction candidate against pages loaded from PostgreSQL
 * (not extract-time Reader memory).
 */
export function verifyPackCandidateEvidence(input: VerifyPackCandidateEvidenceInput): EvidenceVerificationV1 {
  if (!input.persistedPages.found || input.persistedPages.pages.length === 0) {
    return verifyCandidateFactEvidence({
      expected: input.expected,
      persisted: {
        hive_id: input.persistedPages.hive_id,
        source_document_id: input.persistedPages.source_document_id,
        source_sha256: input.persistedPages.source_sha256,
        read_fingerprint: input.persistedPages.read_fingerprint,
        page_set_digest: input.persistedPages.page_set_digest,
        pages: [],
      },
      fact: {
        status: input.fact.status,
        value: input.fact.value,
        evidence: input.fact.evidence,
      },
      valueKind: resolveValueKind(input.catalog, input.fact),
    });
  }

  return verifyCandidateFactEvidence({
    expected: input.expected,
    persisted: listDocumentPagesToCorpus(input.persistedPages),
    fact: {
      status: input.fact.status,
      value: input.fact.value,
      evidence: input.fact.evidence,
    },
    valueKind: resolveValueKind(input.catalog, input.fact),
  });
}
