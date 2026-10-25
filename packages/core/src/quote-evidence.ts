/** Whitespace- and Unicode-compatibility-normalized form used for structural quote checks (P2.2 / P2.3). */
export function normalizeQuoteText(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim();
}

/** True when `quote` occurs in `pageText` after the shared normalization policy. */
export function quoteFoundInPageText(pageText: string, quote: string): boolean {
  const normalizedPage = normalizeQuoteText(pageText);
  const normalizedQuote = normalizeQuoteText(quote);
  return normalizedQuote.length > 0 && normalizedPage.includes(normalizedQuote);
}
