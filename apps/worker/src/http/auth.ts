export class WorkerHttpAuthError extends Error {
  constructor(
    readonly statusCode: number,
    readonly errorCode: string,
    readonly messageSafe: string,
    readonly retryable: boolean,
  ) {
    super(messageSafe);
    this.name = "WorkerHttpAuthError";
  }
}

export function requireWorkerServiceToken(authorization: string | null): void {
  const expected = process.env.WORKER_SERVICE_TOKEN?.trim();
  if (!expected) {
    throw new WorkerHttpAuthError(
      503,
      "DEPENDENCY_UNAVAILABLE",
      "Worker service authentication is not configured.",
      true,
    );
  }
  if (!authorization?.startsWith("Bearer ")) {
    throw new WorkerHttpAuthError(401, "AUTH_FAILED", "Authentication required.", false);
  }
  const token = authorization.slice("Bearer ".length).trim();
  if (token !== expected) {
    throw new WorkerHttpAuthError(401, "AUTH_FAILED", "Authentication failed.", false);
  }
}
