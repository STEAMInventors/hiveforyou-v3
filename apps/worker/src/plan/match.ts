import type { DocumentClassificationV1, MatchTierV1 } from "@hiveforyou/contracts/extraction/v1";
import type { DomainPackManifestV1 } from "@hiveforyou/contracts/domain-packs/v1";
import { scoreReceiptLikeDocument } from "@hiveforyou/core";

import {
  EXACT_MATCH_THRESHOLD,
  PARTIAL_DOMAIN_THRESHOLD,
  RECEIPT_LIKE_THRESHOLD,
} from "./thresholds.js";

export type MatchSelectionV1 = {
  match_tier: MatchTierV1;
  pack_id: string | null;
  pack_version: string | null;
  pack_digest: string | null;
  domain_id: string | null;
  document_type_id: string | null;
  receipt_like_score: number;
};

export function selectMatchTier(
  classification: DocumentClassificationV1,
  packs: { manifest: DomainPackManifestV1 | import("@hiveforyou/contracts/domain-packs/v2").DomainPackManifestV2; digest: string }[],
  combinedPageText: string,
): MatchSelectionV1 {
  const chosen = classification.chosen;
  const receiptLikeScore = scoreReceiptLikeDocument(combinedPageText);

  if (chosen.document_type_id && chosen.score >= EXACT_MATCH_THRESHOLD) {
    const pack = packs.find((entry) => entry.manifest.pack_id === chosen.pack_id);
    return {
      match_tier: "exact",
      pack_id: chosen.pack_id,
      pack_version: pack?.manifest.pack_version ?? null,
      pack_digest: pack?.digest ?? null,
      domain_id: chosen.domain_id,
      document_type_id: chosen.document_type_id,
      receipt_like_score: receiptLikeScore,
    };
  }

  if (chosen.domain_id && chosen.score >= PARTIAL_DOMAIN_THRESHOLD) {
    const pack = packs.find((entry) => entry.manifest.pack_id === chosen.pack_id);
    return {
      match_tier: "partial",
      pack_id: chosen.pack_id,
      pack_version: pack?.manifest.pack_version ?? null,
      pack_digest: pack?.digest ?? null,
      domain_id: chosen.domain_id,
      document_type_id: chosen.document_type_id,
      receipt_like_score: receiptLikeScore,
    };
  }

  return {
    match_tier: "generic",
    pack_id: null,
    pack_version: null,
    pack_digest: null,
    domain_id: null,
    document_type_id: null,
    receipt_like_score: receiptLikeScore,
  };
}

export function isReceiptLikeGeneric(selection: MatchSelectionV1): boolean {
  return (
    selection.match_tier === "generic" &&
    selection.receipt_like_score >= RECEIPT_LIKE_THRESHOLD
  );
}
