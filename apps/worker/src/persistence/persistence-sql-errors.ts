import { ErrorCategory } from "@hiveforyou/contracts/errors/v1";

export type PersistenceBoundaryError = {
  error_code: string;
  category: (typeof ErrorCategory)[keyof typeof ErrorCategory];
  retryable: boolean;
  message_safe: string;
};

const SQL_SIGNAL_TO_BOUNDARY: Record<string, PersistenceBoundaryError> = {
  access_denied: {
    error_code: "ACCESS_DENIED",
    category: ErrorCategory.AUTHORIZATION,
    retryable: false,
    message_safe: "You do not have access to this Hive or run.",
  },
  idempotency_hive_mismatch: {
    error_code: "ACCESS_DENIED",
    category: ErrorCategory.AUTHORIZATION,
    retryable: false,
    message_safe: "This request could not be completed.",
  },
  intent_hive_mismatch: {
    error_code: "INVALID_REQUEST",
    category: ErrorCategory.VALIDATION,
    retryable: false,
    message_safe: "The intent does not belong to this Hive.",
  },
  artifact_revision_hash_conflict: {
    error_code: "INVALID_REQUEST",
    category: ErrorCategory.VALIDATION,
    retryable: false,
    message_safe: "This processing artifact could not be saved.",
  },
  study_run_not_found: {
    error_code: "NOT_FOUND",
    category: ErrorCategory.NOT_FOUND,
    retryable: false,
    message_safe: "The processing run was not found.",
  },
  artifact_not_found: {
    error_code: "NOT_FOUND",
    category: ErrorCategory.NOT_FOUND,
    retryable: false,
    message_safe: "The processing artifact was not found.",
  },
  study_run_terminal: {
    error_code: "INVALID_REQUEST",
    category: ErrorCategory.VALIDATION,
    retryable: false,
    message_safe: "This processing run has already finished.",
  },
  hive_deletion_in_progress: {
    error_code: "INVALID_REQUEST",
    category: ErrorCategory.VALIDATION,
    retryable: false,
    message_safe: "This Hive is being deleted.",
  },
  hive_archived: {
    error_code: "INVALID_REQUEST",
    category: ErrorCategory.VALIDATION,
    retryable: false,
    message_safe: "This Hive is not available.",
  },
  no_registered_sources: {
    error_code: "INVALID_REQUEST",
    category: ErrorCategory.VALIDATION,
    retryable: false,
    message_safe: "Add at least one registered document before starting processing.",
  },
  invalid_idempotency_key: {
    error_code: "INVALID_REQUEST",
    category: ErrorCategory.VALIDATION,
    retryable: false,
    message_safe: "This request could not be submitted.",
  },
  invalid_request_text: {
    error_code: "INVALID_REQUEST",
    category: ErrorCategory.VALIDATION,
    retryable: false,
    message_safe: "Describe what you want this study to answer.",
  },
  deletion_in_progress: {
    error_code: "INVALID_REQUEST",
    category: ErrorCategory.VALIDATION,
    retryable: false,
    message_safe: "Document changes are in progress. Try again when deletion finishes.",
  },
  auth_required: {
    error_code: "AUTH_FAILED",
    category: ErrorCategory.AUTH,
    retryable: false,
    message_safe: "Sign in to continue.",
  },
  hive_not_found: {
    error_code: "NOT_FOUND",
    category: ErrorCategory.NOT_FOUND,
    retryable: false,
    message_safe: "This Hive was not found.",
  },
  batch_hash_conflict: {
    error_code: "INVALID_REQUEST",
    category: ErrorCategory.VALIDATION,
    retryable: false,
    message_safe: "This extraction result conflicts with one already saved.",
  },
  batch_hive_mismatch: {
    error_code: "ACCESS_DENIED",
    category: ErrorCategory.AUTHORIZATION,
    retryable: false,
    message_safe: "This document does not belong to the Hive.",
  },
  batch_invalid: {
    error_code: "INVALID_REQUEST",
    category: ErrorCategory.VALIDATION,
    retryable: false,
    message_safe: "This extraction result could not be saved.",
  },
  prompt_digest_collision: {
    error_code: "EXTRACTION_FAILED",
    category: ErrorCategory.PROCESSING,
    retryable: false,
    message_safe: "The extraction prompt could not be saved.",
  },
  prompt_invalid: {
    error_code: "EXTRACTION_FAILED",
    category: ErrorCategory.PROCESSING,
    retryable: false,
    message_safe: "The extraction prompt could not be saved.",
  },
};

const TRANSIENT_SIGNALS = [
  "fetch failed",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "socket hang up",
  "deadlock detected",
  "could not serialize access",
  "canceling statement due to statement timeout",
  "too many connections",
];

const DB_TRANSIENT_BOUNDARY: PersistenceBoundaryError = {
  error_code: "DB_TRANSIENT",
  category: ErrorCategory.DEPENDENCY,
  retryable: true,
  message_safe: "Saving results is temporarily unavailable.",
};

/** Map Postgres RAISE EXCEPTION signals from Gate 1 RPCs to error-envelope@1 codes. */
export function classifyPersistenceSqlError(cause: unknown): PersistenceBoundaryError | null {
  const message =
    cause instanceof Error
      ? cause.message
      : typeof cause === "string"
        ? cause
        : "";

  for (const signal of Object.keys(SQL_SIGNAL_TO_BOUNDARY)) {
    if (message.includes(signal)) {
      return SQL_SIGNAL_TO_BOUNDARY[signal] ?? null;
    }
  }
  if (TRANSIENT_SIGNALS.some((signal) => message.includes(signal))) {
    return DB_TRANSIENT_BOUNDARY;
  }
  return null;
}
