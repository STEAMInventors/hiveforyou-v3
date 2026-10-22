import type {
  DomainPackDocumentTypeV1,
  DomainPackManifestV1,
} from "@hiveforyou/contracts/domain-packs/v1";

export type DocumentTypeScoreV1 = {
  pack_id: string;
  pack_version: string;
  domain_id: string;
  document_type_id: string;
  score: number;
  reasons: string[];
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

export function scoreDocumentTypeMatch(
  manifest: DomainPackManifestV1,
  documentType: DomainPackDocumentTypeV1,
  context: {
    combinedPageText: string;
    pageCount: number;
    filename: string;
  },
): DocumentTypeScoreV1 {
  const haystack = normalizeText(
    `${context.filename}\n${context.combinedPageText}`,
  );
  const signals = documentType.match;
  const reasons: string[] = [];
  let score = 0;

  const titlePatterns = signals.title_patterns ?? [];
  const titleHits = countKeywordHits(haystack, titlePatterns);
  if (titleHits > 0) {
    score += Math.min(0.45, titleHits * 0.15);
    reasons.push("title_pattern");
  }

  const keywordHits = countKeywordHits(haystack, signals.keywords ?? []);
  if (keywordHits > 0) {
    score += Math.min(0.35, keywordHits * 0.07);
    reasons.push("keywords");
  }

  const sectionHits = countKeywordHits(haystack, signals.section_headers ?? []);
  if (sectionHits > 0) {
    score += Math.min(0.25, sectionHits * 0.08);
    reasons.push("section_headers");
  }

  if (signals.min_pages != null && context.pageCount >= signals.min_pages) {
    score += 0.05;
    reasons.push("min_pages");
  }

  return {
    pack_id: manifest.pack_id,
    pack_version: manifest.pack_version,
    domain_id: documentType.domain_id,
    document_type_id: documentType.document_type_id,
    score: Math.min(1, score),
    reasons,
  };
}

export function scoreAllDocumentTypes(
  manifests: DomainPackManifestV1[],
  context: {
    combinedPageText: string;
    pageCount: number;
    filename: string;
  },
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
