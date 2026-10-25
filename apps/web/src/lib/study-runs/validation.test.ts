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

  it("keeps the question wording and stores only a domain hint", () => {
    const question = "What changed since the last plan?";
    const parsed = parseSubmitStudyProcessingBody({
      request_text: `  ${question}  `,
      trigger: "study",
      idempotency_key: "delivery-2",
      clarification_json: {
        domain_hint: "iep",
        request_text: "do not keep this",
        notes: "private",
      },
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.request_text).toBe(question);
      expect(parsed.value.clarification_json).toEqual({ domain_hint: "iep" });
    }
  });

  it("rejects an invalid domain hint instead of silently dropping it", () => {
    const parsed = parseSubmitStudyProcessingBody({
      request_text: "List the services and amounts.",
      idempotency_key: "delivery-3",
      clarification_json: { domain_hint: "../iep" },
    });
    expect(parsed.ok).toBe(false);
  });

  it("rejects a non-executable Domain Pack selection", () => {
    const parsed = parseSubmitStudyProcessingBody({
      request_text: "Explain this denial letter.",
      idempotency_key: "delivery-4",
      clarification_json: { domain_hint: "medicaid" },
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.message).toContain("not available");
    }
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
