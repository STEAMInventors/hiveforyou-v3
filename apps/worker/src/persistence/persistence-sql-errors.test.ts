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

  it("maps Gate 2b extraction signals", () => {
    expect(classifyPersistenceSqlError(new Error("batch_hash_conflict"))?.error_code).toBe("INVALID_REQUEST");
    expect(classifyPersistenceSqlError(new Error("batch_hive_mismatch"))?.error_code).toBe("ACCESS_DENIED");
    expect(classifyPersistenceSqlError(new Error("prompt_digest_collision"))).toMatchObject({
      error_code: "EXTRACTION_FAILED",
      retryable: false,
    });
  });

  it("maps P2.3 document_pages persistence signals", () => {
    expect(classifyPersistenceSqlError(new Error("page_hive_mismatch"))).toMatchObject({
      error_code: "ACCESS_DENIED",
      retryable: false,
    });
    expect(classifyPersistenceSqlError(new Error("page_source_sha256_mismatch"))).toMatchObject({
      error_code: "INVALID_REQUEST",
      retryable: false,
    });
    expect(classifyPersistenceSqlError(new Error("page_numbering_invalid"))).toMatchObject({
      error_code: "INVALID_REQUEST",
      retryable: false,
    });
    expect(classifyPersistenceSqlError(new Error("page_hash_conflict"))).toMatchObject({
      error_code: "INVALID_REQUEST",
      retryable: false,
    });
    expect(classifyPersistenceSqlError(new Error("page_payload_too_large"))).toMatchObject({
      error_code: "EXTRACTION_FAILED",
      retryable: false,
    });
    expect(classifyPersistenceSqlError(new Error("document_not_found"))).toMatchObject({
      error_code: "NOT_FOUND",
      retryable: false,
    });
  });

  it("maps connection-level failures to retryable DB_TRANSIENT", () => {
    for (const message of ["TypeError: fetch failed", "read ECONNRESET", "deadlock detected"]) {
      expect(classifyPersistenceSqlError(new Error(message))).toMatchObject({
        error_code: "DB_TRANSIENT",
        retryable: true,
      });
    }
  });

  it("returns null for unknown errors", () => {
    expect(classifyPersistenceSqlError(new Error("something else"))).toBeNull();
  });
});
