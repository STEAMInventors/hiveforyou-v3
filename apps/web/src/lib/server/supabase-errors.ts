import { ErrorCode } from "@hiveforyou/contracts/errors/v1";

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
