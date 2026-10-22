import type { ExtractionSchemaFieldV1 } from "@hiveforyou/contracts/extraction/v1";

const INTENT_STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "any",
  "are",
  "because",
  "been",
  "before",
  "being",
  "both",
  "but",
  "can",
  "could",
  "did",
  "does",
  "during",
  "each",
  "else",
  "extract",
  "find",
  "for",
  "from",
  "had",
  "has",
  "have",
  "help",
  "her",
  "here",
  "him",
  "his",
  "how",
  "include",
  "including",
  "into",
  "its",
  "just",
  "let",
  "list",
  "make",
  "may",
  "more",
  "most",
  "must",
  "need",
  "not",
  "now",
  "off",
  "once",
  "only",
  "onto",
  "our",
  "out",
  "over",
  "please",
  "prepare",
  "review",
  "shall",
  "she",
  "should",
  "show",
  "some",
  "such",
  "summarize",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "too",
  "track",
  "under",
  "until",
  "using",
  "very",
  "want",
  "wants",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "why",
  "will",
  "with",
  "would",
  "you",
  "your",
]);

/** Contextual words that often appear in intents but are not standalone extraction requirements. */
const MATERIAL_INTENT_FILLERS = new Set([
  "assigned",
  "child",
  "children",
  "file",
  "mentioned",
  "term",
  "this",
]);

function intentTokens(intent: string): string[] {
  return intent
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !INTENT_STOPWORDS.has(token));
}

function tokenCovered(haystack: string, token: string): boolean {
  if (haystack.includes(token)) {
    return true;
  }
  if (token.endsWith("s") && haystack.includes(token.slice(0, -1))) {
    return true;
  }
  if (!token.endsWith("s") && haystack.includes(`${token}s`)) {
    return true;
  }
  return false;
}

export function uncoveredIntentTokens(
  intent: string,
  fields: ExtractionSchemaFieldV1[],
): string[] {
  const tokens = intentTokens(intent);
  return tokens.filter((token) => {
    return !fields.some((field) => {
      const haystack = `${field.field_key.replaceAll("_", " ")} ${field.title} ${field.description ?? ""}`.toLowerCase();
      return tokenCovered(haystack, token);
    });
  });
}

export function materialUncoveredIntentTokens(
  intent: string,
  fields: ExtractionSchemaFieldV1[],
): string[] {
  return uncoveredIntentTokens(intent, fields).filter(
    (token) => !MATERIAL_INTENT_FILLERS.has(token),
  );
}

/** Exact pack structures call the model when any material intent term lacks field coverage. */
export function intentNeedsSupplementalFields(
  intent: string,
  fields: ExtractionSchemaFieldV1[],
): boolean {
  return materialUncoveredIntentTokens(intent, fields).length > 0;
}
