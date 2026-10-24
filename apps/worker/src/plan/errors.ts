import {
  DEFAULT_RETRYABLE,
  type ErrorCodeType,
} from "@hiveforyou/contracts/errors/v1";

const SAFE_PLANNING_DIAGNOSTIC_KEYS = [
  "reason",
  "field_key_category",
  "validation_boundary",
  "evidence_flag_kind",
  "alias",
  "status",
  "duration_ms",
  "finish_reason",
  "message_content_length",
] as const;

/** Allowlisted planning diagnostics safe for structured Worker logs (no prompts or document text). */
export function pickSafePlanningDiagnostics(
  diagnostics: Record<string, string | number | boolean | null>,
): Record<string, string | number | boolean | null> {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const key of SAFE_PLANNING_DIAGNOSTIC_KEYS) {
    if (key in diagnostics) {
      safe[key] = diagnostics[key];
    }
  }
  return safe;
}

export class PlanningError extends Error {
  readonly errorCode: ErrorCodeType;
  readonly retryable: boolean;
  readonly diagnostics: Record<string, string | number | boolean | null>;

  constructor(
    errorCode: ErrorCodeType,
    message: string,
    diagnostics: Record<string, string | number | boolean | null> = {},
  ) {
    super(message);
    this.name = "PlanningError";
    this.errorCode = errorCode;
    this.retryable = DEFAULT_RETRYABLE[errorCode];
    this.diagnostics = diagnostics;
  }
}
