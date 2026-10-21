/**
 * Stable error codes for error-envelope@1.
 * Extend only via ADR and contract version bump.
 */
export const ERROR_ENVELOPE_VERSION = "error-envelope@1" as const;

export const ErrorCode = {
  AUTH_FAILED: "AUTH_FAILED",
  ACCESS_DENIED: "ACCESS_DENIED",
  INVALID_REQUEST: "INVALID_REQUEST",
  NOT_FOUND: "NOT_FOUND",
  STORAGE_UNAVAILABLE: "STORAGE_UNAVAILABLE",
  STORAGE_NOT_FOUND: "STORAGE_NOT_FOUND",
  MODEL_UNAVAILABLE: "MODEL_UNAVAILABLE",
  MODEL_TIMEOUT: "MODEL_TIMEOUT",
  MODEL_OUTPUT_INVALID: "MODEL_OUTPUT_INVALID",
  EVIDENCE_NOT_VERIFIED: "EVIDENCE_NOT_VERIFIED",
  EXTRACTION_FAILED: "EXTRACTION_FAILED",
  COVERAGE_INCOMPLETE: "COVERAGE_INCOMPLETE",
  MERGE_FAILED: "MERGE_FAILED",
  DB_TRANSIENT: "DB_TRANSIENT",
  DB_OUTCOME_UNKNOWN: "DB_OUTCOME_UNKNOWN",
  DEPENDENCY_UNAVAILABLE: "DEPENDENCY_UNAVAILABLE",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ErrorCategory = {
  AUTH: "auth",
  AUTHORIZATION: "authorization",
  VALIDATION: "validation",
  NOT_FOUND: "not_found",
  STORAGE: "storage",
  MODEL: "model",
  PROCESSING: "processing",
  DEPENDENCY: "dependency",
} as const;

export type ErrorCategory = (typeof ErrorCategory)[keyof typeof ErrorCategory];

/** Default retryability when constructing envelopes (override at classification site). */
export const DEFAULT_RETRYABLE: Record<ErrorCode, boolean> = {
  [ErrorCode.AUTH_FAILED]: false,
  [ErrorCode.ACCESS_DENIED]: false,
  [ErrorCode.INVALID_REQUEST]: false,
  [ErrorCode.NOT_FOUND]: false,
  [ErrorCode.STORAGE_UNAVAILABLE]: true,
  [ErrorCode.STORAGE_NOT_FOUND]: false,
  [ErrorCode.MODEL_UNAVAILABLE]: true,
  [ErrorCode.MODEL_TIMEOUT]: true,
  [ErrorCode.MODEL_OUTPUT_INVALID]: false,
  [ErrorCode.EVIDENCE_NOT_VERIFIED]: false,
  [ErrorCode.EXTRACTION_FAILED]: false,
  [ErrorCode.COVERAGE_INCOMPLETE]: false,
  [ErrorCode.MERGE_FAILED]: false,
  [ErrorCode.DB_TRANSIENT]: true,
  [ErrorCode.DB_OUTCOME_UNKNOWN]: true,
  [ErrorCode.DEPENDENCY_UNAVAILABLE]: true,
};
