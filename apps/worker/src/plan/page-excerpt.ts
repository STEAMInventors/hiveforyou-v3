const MAX_PAGE_CHARS = 4_000;
const MAX_TOTAL_CHARS = 16_000;

export type PageExcerptV1 = {
  page_number: number;
  text: string;
};

/** Bounded page text for a model request. Callers must not log the result. */
export function excerptPages(
  pages: { page_number: number; text: string }[],
): PageExcerptV1[] {
  let remaining = MAX_TOTAL_CHARS;
  const excerpts: PageExcerptV1[] = [];
  for (const page of pages) {
    if (remaining <= 0) {
      excerpts.push({ page_number: page.page_number, text: "" });
      continue;
    }
    const text = page.text.slice(0, Math.min(MAX_PAGE_CHARS, remaining));
    remaining -= text.length;
    excerpts.push({ page_number: page.page_number, text });
  }
  return excerpts;
}
