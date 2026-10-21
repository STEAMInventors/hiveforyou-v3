import type { ErrorCategory, ErrorCode } from "./error-codes.js";
import { DEFAULT_RETRYABLE, ERROR_ENVELOPE_VERSION } from "./error-codes.js";
import type { StudyRunStage } from "./study-run-stage.js";

/** Browser-safe and cross-boundary error shape (error-envelope@1). */
export interface ErrorEnvelopeV1 {
  contract_version: typeof ERROR_ENVELOPE_VERSION;
  error_code: ErrorCode;
  category: ErrorCategory;
  retryable: boolean;
  message_safe: string;
  correlation_id: string;
  study_run_id?: string;
  stage?: StudyRunStage;
}

export interface BuildErrorEnvelopeInput {
  error_code: ErrorCode;
  category: ErrorCategory;
  message_safe: string;
  correlation_id: string;
  study_run_id?: string;
  stage?: StudyRunStage;
  retryable?: boolean;
}

export function buildErrorEnvelopeV1(input: BuildErrorEnvelopeInput): ErrorEnvelopeV1 {
  return {
    contract_version: ERROR_ENVELOPE_VERSION,
    error_code: input.error_code,
    category: input.category,
    retryable: input.retryable ?? DEFAULT_RETRYABLE[input.error_code],
    message_safe: input.message_safe,
    correlation_id: input.correlation_id,
    ...(input.study_run_id !== undefined ? { study_run_id: input.study_run_id } : {}),
    ...(input.stage !== undefined ? { stage: input.stage } : {}),
  };
}
