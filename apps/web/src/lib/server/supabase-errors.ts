import { ErrorCategory, ErrorCode } from "@hiveforyou/contracts/errors/v1";

export type ClassifiedDbError = {
  error_code: ErrorCode;
  retryable: boolean;
  diagnostic_detail: string;
};

export function classifyPostgrestError(error: {
  code?: string;
  message?: string;
  details?: string;
}): ClassifiedDbError {
  const code = error.code ?? "";
  if (code === "42501") {
    return {
      error_code: ErrorCode.ACCESS_DENIED,
      retryable: false,
      diagnostic_detail: code,
    };
  }
  if (code === "23505") {
    return {
      error_code: ErrorCode.INVALID_REQUEST,
      retryable: false,
      diagnostic_detail: "unique_violation",
    };
  }
  if (code === "PGRST106" || code === "PGRST205") {
    return {
      error_code: ErrorCode.DEPENDENCY_UNAVAILABLE,
      retryable: false,
      diagnostic_detail: code,
    };
  }
  if (code.startsWith("08") || code === "57014") {
    return {
      error_code: ErrorCode.DB_TRANSIENT,
      retryable: true,
      diagnostic_detail: code || "connection",
    };
  }
  return {
    error_code: ErrorCode.DEPENDENCY_UNAVAILABLE,
    retryable: true,
    diagnostic_detail: code || "unknown",
  };
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

const RPC_SIGNALS: Record<
  string,
  { error_code: ErrorCode; category: (typeof ErrorCategory)[keyof typeof ErrorCategory]; retryable: boolean; message_safe: string }
> = {
  access_denied: {
    error_code: ErrorCode.ACCESS_DENIED,
    category: ErrorCategory.AUTHORIZATION,
    retryable: false,
    message_safe: "You do not have access to this Hive or run.",
  },
  no_registered_sources: {
    error_code: ErrorCode.INVALID_REQUEST,
    category: ErrorCategory.VALIDATION,
    retryable: false,
    message_safe: "Add at least one registered document before starting processing.",
  },
  invalid_idempotency_key: {
    error_code: ErrorCode.INVALID_REQUEST,
    category: ErrorCategory.VALIDATION,
    retryable: false,
    message_safe: "This request could not be submitted.",
  },
  invalid_request_text: {
    error_code: ErrorCode.INVALID_REQUEST,
    category: ErrorCategory.VALIDATION,
    retryable: false,
    message_safe: "Describe what you want this study to answer.",
  },
  deletion_in_progress: {
    error_code: ErrorCode.INVALID_REQUEST,
    category: ErrorCategory.VALIDATION,
    retryable: false,
    message_safe: "Document changes are in progress. Try again when deletion finishes.",
  },
  idempotency_hive_mismatch: {
    error_code: ErrorCode.ACCESS_DENIED,
    category: ErrorCategory.AUTHORIZATION,
    retryable: false,
    message_safe: "This request could not be completed.",
  },
};

export function mapSupabaseRpcError(message: string): {
  error_code: ErrorCode;
  category: (typeof ErrorCategory)[keyof typeof ErrorCategory];
  retryable: boolean;
  message_safe: string;
  diagnostic_detail: string;
} {
  for (const [signal, mapped] of Object.entries(RPC_SIGNALS)) {
    if (message.includes(signal)) {
      return { ...mapped, diagnostic_detail: signal };
    }
  }
  const classified = classifyPostgrestError({ message });
  return {
    error_code: classified.error_code,
    category:
      classified.error_code === ErrorCode.ACCESS_DENIED
        ? ErrorCategory.AUTHORIZATION
        : classified.error_code === ErrorCode.INVALID_REQUEST
          ? ErrorCategory.VALIDATION
          : ErrorCategory.DEPENDENCY,
    retryable: classified.retryable,
    message_safe: "Something went wrong. Try again.",
    diagnostic_detail: classified.diagnostic_detail,
  };
}
