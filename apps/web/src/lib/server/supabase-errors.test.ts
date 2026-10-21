import { describe, expect, it } from "vitest";

import { classifyPostgrestError, isAbortError } from "./supabase-errors";

describe("classifyPostgrestError", () => {
  it("maps permission denied", () => {
    expect(classifyPostgrestError({ code: "42501" }).error_code).toBe("ACCESS_DENIED");
  });

  it("maps schema exposure failure", () => {
    expect(classifyPostgrestError({ code: "PGRST106" }).error_code).toBe("DEPENDENCY_UNAVAILABLE");
  });
});

describe("isAbortError", () => {
  it("detects timeout errors", () => {
    const err = new Error("timeout");
    err.name = "AbortError";
    expect(isAbortError(err)).toBe(true);
  });
});
