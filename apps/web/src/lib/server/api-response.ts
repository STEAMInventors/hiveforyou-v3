import {
  buildErrorEnvelopeV1,
  ErrorCategory,
  type ErrorCode,
} from "@hiveforyou/contracts/errors/v1";
import { NextResponse } from "next/server";

import { CORRELATION_HEADER } from "./correlation";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  AUTH_FAILED: 401,
  ACCESS_DENIED: 403,
  INVALID_REQUEST: 400,
  NOT_FOUND: 404,
  STORAGE_UNAVAILABLE: 503,
  STORAGE_NOT_FOUND: 404,
  MODEL_UNAVAILABLE: 503,
  MODEL_TIMEOUT: 504,
  MODEL_OUTPUT_INVALID: 422,
  EVIDENCE_NOT_VERIFIED: 422,
  EXTRACTION_FAILED: 422,
  COVERAGE_INCOMPLETE: 422,
  MERGE_FAILED: 422,
  DB_TRANSIENT: 503,
  DB_OUTCOME_UNKNOWN: 503,
  DEPENDENCY_UNAVAILABLE: 503,
};

export function jsonSuccess<T>(
  correlationId: string,
  body: T,
  status = 200,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { [CORRELATION_HEADER]: correlationId },
  });
}

export function jsonError(
  correlationId: string,
  input: {
    error_code: ErrorCode;
    category: (typeof ErrorCategory)[keyof typeof ErrorCategory];
    message_safe: string;
    retryable?: boolean;
  },
): NextResponse {
  const envelope = buildErrorEnvelopeV1({
    ...input,
    correlation_id: correlationId,
  });
  return NextResponse.json(envelope, {
    status: STATUS_BY_CODE[input.error_code] ?? 503,
    headers: { [CORRELATION_HEADER]: correlationId },
  });
}
