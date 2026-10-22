import {
  DOCUMENT_CLASSIFICATION_VERSION,
  type DocumentClassificationV1,
} from "@hiveforyou/contracts/extraction/v1";
import type { DomainPackManifestV1 } from "@hiveforyou/contracts/domain-packs/v1";
import { scoreAllDocumentTypes } from "@hiveforyou/core";

import {
  DOMAIN_AMBIGUITY_MARGIN,
  EXACT_MATCH_THRESHOLD,
} from "./thresholds.js";

export const AMBIGUITY_NO_STRONG_MATCH =
  "No strong document type match from declarative pack signals.";
export const AMBIGUITY_MULTIPLE_DOMAINS =
  "Multiple domains remain plausible; domain was not forced.";

export type ClassifyDocumentInputV1 = {
  source_document_id: string;
  filename: string;
  pages: { page_number: number; text: string }[];
  domain_hint: string | null;
  packs: DomainPackManifestV1[];
  correlation_id?: string;
  study_run_id?: string;
};

export function classificationIsInconclusive(
  classification: DocumentClassificationV1,
): boolean {
  if (classification.classification_quality !== "high") {
    return true;
  }
  if (!classification.chosen.document_type_id) {
    return true;
  }
  if (classification.chosen.score < EXACT_MATCH_THRESHOLD) {
    return true;
  }
  return classification.ambiguity_notes.includes(AMBIGUITY_MULTIPLE_DOMAINS);
}

export function classifyDocument(input: ClassifyDocumentInputV1): DocumentClassificationV1 {
  const combinedPageText = input.pages.map((page) => page.text).join("\n");
  const scores = scoreAllDocumentTypes(input.packs, {
    combinedPageText,
    pageCount: input.pages.length,
    filename: input.filename,
  });

  if (input.domain_hint) {
    for (const score of scores) {
      if (score.domain_id === input.domain_hint) {
        score.score = Math.min(1, score.score + 0.08);
      }
    }
    scores.sort((a, b) => b.score - a.score);
  }

  const top = scores[0];
  const second = scores[1];
  const ambiguityNotes: string[] = [];

  if (!top || top.score < EXACT_MATCH_THRESHOLD * 0.5) {
    ambiguityNotes.push(AMBIGUITY_NO_STRONG_MATCH);
  }
  if (
    top &&
    second &&
    top.domain_id !== second.domain_id &&
    second.score >= top.score - DOMAIN_AMBIGUITY_MARGIN
  ) {
    ambiguityNotes.push(AMBIGUITY_MULTIPLE_DOMAINS);
  }

  const chosen = top
    ? {
        domain_id: top.score >= EXACT_MATCH_THRESHOLD * 0.5 ? top.domain_id : null,
        document_type_id:
          top.score >= EXACT_MATCH_THRESHOLD ? top.document_type_id : null,
        pack_id: top.score >= EXACT_MATCH_THRESHOLD * 0.5 ? top.pack_id : null,
        score: top.score,
      }
    : {
        domain_id: null,
        document_type_id: null,
        pack_id: null,
        score: 0,
      };

  const classificationQuality: DocumentClassificationV1["classification_quality"] =
    top && top.score >= EXACT_MATCH_THRESHOLD
      ? "high"
      : top && top.score >= EXACT_MATCH_THRESHOLD * 0.5
        ? "medium"
        : "low";

  return {
    contract_version: DOCUMENT_CLASSIFICATION_VERSION,
    source_document_id: input.source_document_id,
    chosen,
    candidates: scores.slice(0, 5).map((score) => ({
      domain_id: score.domain_id,
      document_type_id: score.document_type_id,
      pack_id: score.pack_id,
      score: score.score,
    })),
    ambiguity_notes: ambiguityNotes,
    classification_quality: classificationQuality,
    detected_sections: [],
  };
}
