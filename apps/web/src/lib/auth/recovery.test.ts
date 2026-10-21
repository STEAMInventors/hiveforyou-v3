import { describe, expect, it } from "vitest";

import { isRecoveryCookieValue, isRecoveryResetSession } from "./recovery";

describe("recovery marker cookie", () => {
  it("accepts only the recovery flag value", () => {
    expect(isRecoveryCookieValue("1")).toBe(true);
    expect(isRecoveryCookieValue("true")).toBe(false);
    expect(isRecoveryCookieValue(undefined)).toBe(false);
  });
});

describe("recovery reset-password session", () => {
  it("requires both a signed-in session and the recovery marker", () => {
    expect(isRecoveryResetSession(true, "1")).toBe(true);
    expect(isRecoveryResetSession(false, "1")).toBe(false);
    expect(isRecoveryResetSession(true, undefined)).toBe(false);
  });
});
