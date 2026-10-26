import type { PackCatalogFactDefinition, PackFactCatalogBody } from "./pack-fact-catalog.js";
import { normalizeQuoteText } from "./quote-evidence.js";

export type PackFieldSynonymEntryV1 = {
  field: string;
  terms: string[];
  value?: string;
};

/** Normalize catalog codes and enum phrases for deterministic substring comparison. */
export function normalizeCatalogComparableToken(text: string): string {
  return normalizeQuoteText(text)
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/-/g, " ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFieldSynonymEntry(raw: unknown): PackFieldSynonymEntryV1 | null {
  if (!isRecord(raw)) {
    return null;
  }
  if (typeof raw.field !== "string" || raw.field.trim().length === 0) {
    return null;
  }
  if (!Array.isArray(raw.terms) || raw.terms.length === 0) {
    return null;
  }
  const terms: string[] = [];
  for (const term of raw.terms) {
    if (typeof term !== "string" || term.trim().length === 0) {
      return null;
    }
    terms.push(term);
  }
  const entry: PackFieldSynonymEntryV1 = {
    field: raw.field.trim(),
    terms,
  };
  if (raw.value !== undefined) {
    if (typeof raw.value !== "string" || raw.value.trim().length === 0) {
      return null;
    }
    entry.value = raw.value.trim();
  }
  return entry;
}

/**
 * Parse `vocabulary.fieldSynonyms` from a pinned pack manifest.
 * Returns `null` when synonyms are missing (not an error). Returns `[]` when present but malformed
 * or when the same normalized term maps to conflicting catalog values for one field.
 */
export function parsePackFieldSynonyms(
  packVocabulary: Record<string, unknown> | undefined,
): PackFieldSynonymEntryV1[] | null {
  if (packVocabulary === undefined) {
    return null;
  }
  const rawList = packVocabulary.fieldSynonyms;
  if (rawList === undefined) {
    return null;
  }
  if (!Array.isArray(rawList)) {
    return [];
  }

  const entries: PackFieldSynonymEntryV1[] = [];
  for (const raw of rawList) {
    const parsed = parseFieldSynonymEntry(raw);
    if (!parsed) {
      return [];
    }
    entries.push(parsed);
  }

  const termToValueByField = new Map<string, Map<string, string>>();
  for (const entry of entries) {
    if (entry.value === undefined) {
      continue;
    }
    let termMap = termToValueByField.get(entry.field);
    if (!termMap) {
      termMap = new Map();
      termToValueByField.set(entry.field, termMap);
    }
    for (const term of entry.terms) {
      const key = normalizeCatalogComparableToken(term);
      if (key.length === 0) {
        continue;
      }
      const prior = termMap.get(key);
      if (prior !== undefined && prior !== entry.value) {
        return [];
      }
      termMap.set(key, entry.value);
    }
  }

  return entries;
}

export type CatalogFactValueSupportContextV1 = {
  factFieldKey: string;
  enumValues?: readonly string[];
  fieldSynonyms: PackFieldSynonymEntryV1[] | null;
};

export function resolveCatalogFactDefinition(
  catalog: PackFactCatalogBody,
  recordTypeId: string,
  factId: string,
): PackCatalogFactDefinition | undefined {
  for (const recordType of catalog.record_types) {
    if (recordType.record_type_id !== recordTypeId) {
      continue;
    }
    return recordType.facts.find((fact) => fact.fact_id === factId);
  }
  return undefined;
}

export function buildCatalogFactValueSupportContext(input: {
  catalog: PackFactCatalogBody;
  recordTypeId: string;
  factId: string;
  packVocabulary?: Record<string, unknown>;
}): CatalogFactValueSupportContextV1 {
  const definition = resolveCatalogFactDefinition(input.catalog, input.recordTypeId, input.factId);
  const fieldId = definition?.field_id ?? input.factId.split(".").slice(1).join(".");
  const factFieldKey = `${input.recordTypeId}.${fieldId}`;
  return {
    factFieldKey,
    enumValues: definition?.enum,
    fieldSynonyms: parsePackFieldSynonyms(input.packVocabulary),
  };
}

export function searchPhrasesForCatalogCode(
  code: string,
  factFieldKey: string,
  fieldSynonyms: PackFieldSynonymEntryV1[] | null,
): string[] {
  const phrases = new Set<string>([code]);
  if (fieldSynonyms) {
    for (const entry of fieldSynonyms) {
      if (entry.field !== factFieldKey || entry.value !== code) {
        continue;
      }
      for (const term of entry.terms) {
        phrases.add(term);
      }
    }
  }
  return [...phrases];
}

export function combinedQuoteComparableText(normalizedQuoteTexts: readonly string[]): string {
  return normalizeCatalogComparableToken(normalizedQuoteTexts.join(" "));
}

export function phraseSupportedInQuotes(phrase: string, normalizedQuoteTexts: readonly string[]): boolean {
  const needle = normalizeCatalogComparableToken(phrase);
  if (needle.length === 0) {
    return false;
  }
  const haystack = combinedQuoteComparableText(normalizedQuoteTexts);
  return haystack.includes(needle);
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const US_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export function calendarDateToIso(year: number, month: number, day: number): string | null {
  if (!isValidCalendarDate(year, month, day)) {
    return null;
  }
  const y = String(year).padStart(4, "0");
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseIsoCalendarDate(value: string): string | null {
  const match = value.trim().match(ISO_DATE_RE);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return calendarDateToIso(year, month, day);
}

export function parseUsCalendarDate(value: string): string | null {
  const match = value.trim().match(US_DATE_RE);
  if (!match) {
    return null;
  }
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  return calendarDateToIso(year, month, day);
}

/** Extract distinct ISO calendar dates from quote text (ISO and strict MM/DD/YYYY only). */
export function extractComparableCalendarDatesFromQuotes(normalizedQuoteTexts: readonly string[]): Set<string> {
  const combined = normalizedQuoteTexts.join("\n");
  const found = new Set<string>();

  for (const isoMatch of combined.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)) {
    const iso = parseIsoCalendarDate(isoMatch[1]!);
    if (iso) {
      found.add(iso);
    }
  }

  for (const usMatch of combined.matchAll(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/g)) {
    const iso = parseUsCalendarDate(usMatch[1]!);
    if (iso) {
      found.add(iso);
    }
  }

  return found;
}
