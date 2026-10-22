import {
  DEFAULT_RETRYABLE,
  type ErrorCodeType,
} from "@hiveforyou/contracts/errors/v1";

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
