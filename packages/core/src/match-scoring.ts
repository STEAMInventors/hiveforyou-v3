import type {
  DomainPackDocumentTypeV1,
  DomainPackManifestV1,
} from "@hiveforyou/contracts/domain-packs/v1";
import type { DomainPackMatchSignalsV2 } from "@hiveforyou/contracts/domain-packs/v2";

import type { NormalizedDomainPackManifest } from "./pack-normalize.js";

export type DocumentTypeScoreV1 = {
  pack_id: string;
  pack_version: string;
  domain_id: string;
  document_type_id: string;
  score: number;
  reasons: string[];
  title_score?: number;
  body_score?: number;
};

export type MatchScoringContext = {
  combinedPageText: string;
  pageCount: number;
  filename: string;
};

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function countKeywordHits(haystack: string, keywords: string[]): number {
  let hits = 0;
  for (const keyword of keywords) {
    if (haystack.includes(normalizeText(keyword))) {
      hits += 1;
    }
  }
  return hits;
}

function titleZone(context: MatchScoringContext): string {
  const fromText = context.combinedPageText.slice(0, 700);
  const firstBreak = fromText.indexOf("\n\n");
  const bodyTitle = firstBreak > 0 ? fromText.slice(0, firstBreak) : fromText;
  return normalizeText(`${context.filename}\n${bodyTitle}`);
}

function isMatchSignalsV2(
  signals: DomainPackDocumentTypeV1["match"],
): signals is DomainPackMatchSignalsV2 {
  return (
    "title_only_patterns" in signals ||
    "body_keywords" in signals ||
    "disambiguation_priority" in signals
  );
}

export function scoreDocumentTypeMatch(
  manifest: DomainPackManifestV1 | NormalizedDomainPackManifest,
  documentType: DomainPackDocumentTypeV1,
  context: MatchScoringContext,
): DocumentTypeScoreV1 {
  const haystack = normalizeText(`${context.filename}\n${context.combinedPageText}`);
  const titleHaystack = titleZone(context);
  const signals = documentType.match;
  const reasons: string[] = [];
  let score = 0;
  let titleScore = 0;
  let bodyScore = 0;

  const titlePatterns = signals.title_patterns ?? [];
  const titleOnlyPatterns =
    isMatchSignalsV2(signals) && signals.title_only_patterns
      ? signals.title_only_patterns
      : titlePatterns;
  const bodyKeywords =
    isMatchSignalsV2(signals) && signals.body_keywords
      ? signals.body_keywords
      : signals.keywords ?? [];

  const titleOnlyHits = countKeywordHits(titleHaystack, titleOnlyPatterns);
  if (titleOnlyHits > 0) {
    titleScore += Math.min(0.5, titleOnlyHits * 0.17);
    reasons.push("title_zone");
  }

  const titleHits = countKeywordHits(titleHaystack, titlePatterns);
  if (titleHits > 0) {
    titleScore += Math.min(0.25, titleHits * 0.08);
    reasons.push("title_pattern");
  }

  const keywordHits = countKeywordHits(haystack, bodyKeywords);
  if (keywordHits > 0) {
    bodyScore += Math.min(0.35, keywordHits * 0.07);
    reasons.push("body_keywords");
  }

  const sectionHits = countKeywordHits(haystack, signals.section_headers ?? []);
  if (sectionHits > 0) {
    bodyScore += Math.min(0.2, sectionHits * 0.07);
    reasons.push("section_headers");
  }

  if (isMatchSignalsV2(signals) && signals.negative_keywords?.length) {
    const negativeHits = countKeywordHits(haystack, signals.negative_keywords);
    if (negativeHits > 0) {
      bodyScore -= Math.min(0.25, negativeHits * 0.08);
      reasons.push("negative_keywords");
    }
  }

  if (isMatchSignalsV2(signals) && signals.filename_patterns?.length) {
    const filenameHaystack = normalizeText(context.filename);
    const filenameHits = countKeywordHits(filenameHaystack, signals.filename_patterns);
    if (filenameHits > 0) {
      titleScore += Math.min(0.15, filenameHits * 0.08);
      reasons.push("filename");
    }
  }

  if (signals.min_pages != null && context.pageCount >= signals.min_pages) {
    bodyScore += 0.05;
    reasons.push("min_pages");
  }

  score = Math.max(0, titleScore + bodyScore);
  if (isMatchSignalsV2(signals) && signals.disambiguation_priority != null) {
    score += Math.min(0.05, signals.disambiguation_priority * 0.005);
  }

  return {
    pack_id: manifest.pack_id,
    pack_version: manifest.pack_version,
    domain_id: documentType.domain_id,
    document_type_id: documentType.document_type_id,
    score: Math.min(1, score),
    reasons,
    title_score: titleScore,
    body_score: bodyScore,
  };
}

export function scoreAllDocumentTypes(
  manifests: (DomainPackManifestV1 | NormalizedDomainPackManifest)[],
  context: MatchScoringContext,
): DocumentTypeScoreV1[] {
  const scores: DocumentTypeScoreV1[] = [];
  for (const manifest of manifests) {
    for (const documentType of manifest.document_types) {
      scores.push(scoreDocumentTypeMatch(manifest, documentType, context));
    }
  }
  return scores.sort((a, b) => b.score - a.score);
}

/** Domain-neutral receipt-like signals for pack-free grocery paths. */
export function scoreReceiptLikeDocument(combinedPageText: string): number {
  const haystack = normalizeText(combinedPageText);
  const tokens = ["subtotal", "total", "tax", "receipt", "qty", "item"];
  let hits = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) {
      hits += 1;
    }
  }
  return Math.min(1, hits * 0.14);
}

export function detectTitleBodyCollision(
  scores: DocumentTypeScoreV1[],
): { titleLeader: DocumentTypeScoreV1; bodyLeader: DocumentTypeScoreV1 } | null {
  if (scores.length < 2) {
    return null;
  }
  const byTitle = [...scores].sort(
    (a, b) => (b.title_score ?? 0) - (a.title_score ?? 0),
  )[0];
  const byBody = [...scores].sort((a, b) => (b.body_score ?? 0) - (a.body_score ?? 0))[0];
  if (!byTitle || !byBody) {
    return null;
  }
  if (
    byTitle.document_type_id !== byBody.document_type_id &&
    (byTitle.title_score ?? 0) >= 0.35 &&
    (byBody.body_score ?? 0) >= 0.35 &&
    byTitle.score >= 0.275 &&
    byBody.score >= 0.275
  ) {
    return { titleLeader: byTitle, bodyLeader: byBody };
  }
  return null;
}
