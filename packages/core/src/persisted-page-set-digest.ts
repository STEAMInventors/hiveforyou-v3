import { computeSha256Digest } from "./pack-digest.js";

/** Canonical digest over ordered page text hashes — immutable read generation identity (P2.3). */
export const DOCUMENT_PAGE_SET_DIGEST_VERSION = "document-page-set@1" as const;

export function computePageSetDigest(input: {
  sourceSha256: string;
  pageCount: number;
  pages: ReadonlyArray<{ page_number: number; page_text_sha256: string }>;
}): string {
  const source = input.sourceSha256.trim().toLowerCase();
  const hashes = [...input.pages]
    .sort((a, b) => a.page_number - b.page_number)
    .map((page) => page.page_text_sha256.trim().toLowerCase())
    .join("\n");
  const material = `${DOCUMENT_PAGE_SET_DIGEST_VERSION}\n${source}\n${input.pageCount}\n${hashes}\n`;
  return computeSha256Digest(material);
}
