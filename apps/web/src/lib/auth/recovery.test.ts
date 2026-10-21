import { describe, expect, it } from "vitest";

import { isRecoveryCookieValue, recoveryNextCookieValue } from "./recovery";

describe("recovery cookies", () => {
  it("accepts only the recovery flag value", () => {
    expect(isRecoveryCookieValue("1")).toBe(true);
    expect(isRecoveryCookieValue("true")).toBe(false);
    expect(isRecoveryCookieValue(undefined)).toBe(false);
  });

  it("stores only an internal path for the post-reset destination", () => {
    expect(recoveryNextCookieValue("https://evil.example/phish")).toBe("/hives");
    expect(recoveryNextCookieValue("//evil.example")).toBe("/hives");
    expect(recoveryNextCookieValue("/hives/abc")).toBe("/hives/abc");
  });
});
