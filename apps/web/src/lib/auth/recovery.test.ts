import { describe, expect, it } from "vitest";

import { isRecoveryCookieValue } from "./recovery";

describe("recovery marker cookie", () => {
  it("accepts only the recovery flag value", () => {
    expect(isRecoveryCookieValue("1")).toBe(true);
    expect(isRecoveryCookieValue("true")).toBe(false);
    expect(isRecoveryCookieValue(undefined)).toBe(false);
  });
});
