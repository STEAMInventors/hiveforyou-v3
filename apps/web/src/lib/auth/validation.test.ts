import { describe, expect, it } from "vitest";

import { isPlausibleEmail, newPasswordIssue, normalizeEmail } from "./validation";

describe("auth validation", () => {
  it("accepts a normal email and rejects malformed ones", () => {
    expect(isPlausibleEmail(normalizeEmail("  Person@Example.com "))).toBe(true);
    expect(normalizeEmail("  Person@Example.com ")).toBe("person@example.com");
    expect(isPlausibleEmail("not-an-email")).toBe(false);
    expect(isPlausibleEmail("a@b")).toBe(false);
    expect(isPlausibleEmail("")).toBe(false);
  });

  it("checks the new password locally before calling the provider", () => {
    expect(newPasswordIssue("", "secret")).toBe("missing");
    expect(newPasswordIssue("shortpass", "otherpass")).toBe("mismatch");
    expect(newPasswordIssue("shortpass", "shortpass")).toBe("policy");
    expect(newPasswordIssue("long-enough-password", "long-enough-password")).toBeNull();
  });
});
