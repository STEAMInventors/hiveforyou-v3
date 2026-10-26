import { describe, expect, it } from "vitest";

import {
  parsePackFieldSynonyms,
  phraseSupportedInQuotes,
  parseIsoCalendarDate,
  parseUsCalendarDate,
} from "./evidence-value-vocabulary.js";

describe("parsePackFieldSynonyms", () => {
  it("returns null when vocabulary is missing", () => {
    expect(parsePackFieldSynonyms(undefined)).toBeNull();
  });

  it("parses value-bound synonyms", () => {
    const entries = parsePackFieldSynonyms({
      fieldSynonyms: [
        {
          field: "measure.score_type",
          terms: ["WCPM", "words correct per minute"],
          value: "words_correct_per_minute",
        },
      ],
    });
    expect(entries).toHaveLength(1);
    expect(entries![0]!.value).toBe("words_correct_per_minute");
  });

  it("returns empty list when the same term maps to conflicting values", () => {
    const entries = parsePackFieldSynonyms({
      fieldSynonyms: [
        { field: "measure.score_type", terms: ["WCPM"], value: "words_correct_per_minute" },
        { field: "measure.score_type", terms: ["WCPM"], value: "percent_accuracy" },
      ],
    });
    expect(entries).toEqual([]);
  });
});

describe("phraseSupportedInQuotes", () => {
  it("matches underscore catalog codes against spaced quote text", () => {
    expect(
      phraseSupportedInQuotes("education_agency", ["Prepared by the education agency on 03/15/2024"]),
    ).toBe(true);
  });
});

describe("calendar date parsing", () => {
  it("parses ISO and US dates to the same day", () => {
    expect(parseIsoCalendarDate("2024-03-15")).toBe("2024-03-15");
    expect(parseUsCalendarDate("3/15/2024")).toBe("2024-03-15");
  });

  it("rejects invalid calendar dates", () => {
    expect(parseIsoCalendarDate("2024-02-30")).toBeNull();
    expect(parseUsCalendarDate("13/40/2024")).toBeNull();
  });
});
