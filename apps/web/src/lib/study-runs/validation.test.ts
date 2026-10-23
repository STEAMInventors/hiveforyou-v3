import { describe, expect, it } from "vitest";

import { parseSubmitStudyProcessingBody, parseStudyRunIdParam } from "./validation";

describe("parseSubmitStudyProcessingBody", () => {
  it("accepts a valid submit body", () => {
    const parsed = parseSubmitStudyProcessingBody({
      request_text: "Compare totals on these receipts.",
      trigger: "study",
      idempotency_key: "delivery-1",
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.request_text).toContain("Compare totals");
      expect(parsed.value.trigger).toBe("study");
    }
  });

  it("rejects missing request text", () => {
    const parsed = parseSubmitStudyProcessingBody({
      idempotency_key: "delivery-1",
    });
    expect(parsed.ok).toBe(false);
  });

  it("rejects missing idempotency key", () => {
    const parsed = parseSubmitStudyProcessingBody({
      request_text: "Hello",
    });
    expect(parsed.ok).toBe(false);
  });
});

describe("parseStudyRunIdParam", () => {
  it("accepts uuid", () => {
    expect(parseStudyRunIdParam("550e8400-e29b-41d4-a716-446655440000")).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
  });

  it("rejects invalid id", () => {
    expect(parseStudyRunIdParam("not-a-uuid")).toBeNull();
  });
});
