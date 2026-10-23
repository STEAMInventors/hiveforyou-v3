import { describe, expect, it } from "vitest";
import { classifyPersistenceSqlError } from "./persistence-sql-errors.js";

describe("classifyPersistenceSqlError", () => {
  it("maps idempotency hive mismatch to ACCESS_DENIED", () => {
    const mapped = classifyPersistenceSqlError(
      new Error("idempotency_hive_mismatch"),
    );
    expect(mapped?.error_code).toBe("ACCESS_DENIED");
    expect(mapped?.retryable).toBe(false);
  });

  it("maps artifact hash conflict to INVALID_REQUEST", () => {
    const mapped = classifyPersistenceSqlError(
      new Error("artifact_revision_hash_conflict"),
    );
    expect(mapped?.error_code).toBe("INVALID_REQUEST");
  });

  it("maps cross-hive intent mismatch", () => {
    const mapped = classifyPersistenceSqlError(new Error("intent_hive_mismatch"));
    expect(mapped?.error_code).toBe("INVALID_REQUEST");
  });

  it("returns null for unknown errors", () => {
    expect(classifyPersistenceSqlError(new Error("something else"))).toBeNull();
  });
});
