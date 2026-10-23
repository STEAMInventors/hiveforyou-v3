import { connect, ConnectionState, type WorkerConnection } from "inngest/connect";

import { workerInngest } from "./client.js";
import { processStudyRunInngestFunction } from "./functions/process-study-run.js";
import { logWorkerEvent } from "./log.js";

const DEFAULT_CONNECT_STARTUP_TIMEOUT_MS = 120_000;

let activeConnection: WorkerConnection | null = null;
let startupPhase: "idle" | "connecting" | "failed" = "idle";
let startupFailureDiagnostic: string | null = null;
let connectStartupPromise: Promise<void> | null = null;
let connectAttemptSerial = 0;

export type InngestConnectHealthState = ConnectionState | "DISABLED" | "FAILED";

export function getInngestConnectState(): InngestConnectHealthState {
  if (!isInngestConnectConfigured()) {
    return "DISABLED";
  }
  if (startupPhase === "failed") {
    return "FAILED";
  }
  if (startupPhase === "connecting" && !activeConnection) {
    return ConnectionState.CONNECTING;
  }
  if (activeConnection) {
    return activeConnection.state;
  }
  return "DISABLED";
}

export function getInngestConnectStartupDiagnostic(): string | null {
  return startupFailureDiagnostic;
}

export function isInngestConnectConfigured(): boolean {
  if (process.env.INNGEST_DEV?.trim() === "1") {
    return true;
  }
  return Boolean(process.env.INNGEST_SIGNING_KEY?.trim());
}

function readConnectStartupTimeoutMs(): number {
  const parsed = Number.parseInt(
    process.env.WORKER_INNGEST_CONNECT_STARTUP_TIMEOUT_MS?.trim() ??
      String(DEFAULT_CONNECT_STARTUP_TIMEOUT_MS),
    10,
  );
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_CONNECT_STARTUP_TIMEOUT_MS;
  }
  return parsed;
}

const SECRET_LIKE_PATTERN =
  /(?:signkey|signing[_-]?key|bearer\s+\S+|api[_-]?key\s*[:=]\s*\S+|token\s*[:=]\s*\S+)/gi;

export function sanitizeConnectStartupError(error: unknown): {
  error_name: string;
  message_safe: string;
  cause_safe?: string;
} {
  const toSafeMessage = (value: string): string =>
    value.replace(SECRET_LIKE_PATTERN, "[redacted]").trim() || "connect_startup_error";

  if (error instanceof Error) {
    const cause =
      error.cause instanceof Error
        ? toSafeMessage(error.cause.message)
        : typeof error.cause === "string"
          ? toSafeMessage(error.cause)
          : undefined;
    return {
      error_name: error.name || "Error",
      message_safe: toSafeMessage(error.message),
      ...(cause ? { cause_safe: cause } : {}),
    };
  }
  return {
    error_name: "Error",
    message_safe: toSafeMessage(String(error)),
  };
}

function recordStartupFailure(error: unknown): void {
  startupPhase = "failed";
  activeConnection = null;
  const sanitized = sanitizeConnectStartupError(error);
  startupFailureDiagnostic = sanitized.cause_safe
    ? `${sanitized.error_name}: ${sanitized.message_safe} (cause: ${sanitized.cause_safe})`
    : `${sanitized.error_name}: ${sanitized.message_safe}`;
  logWorkerEvent({
    level: "error",
    message: "inngest_connect_startup_failed",
    inngest_connect_state: "FAILED",
    error_name: sanitized.error_name,
    diagnostic_detail: sanitized.message_safe,
    ...(sanitized.cause_safe ? { cause_safe: sanitized.cause_safe } : {}),
  });
}

function connectStartupTimeoutError(timeoutMs: number): Error {
  const error = new Error(`Inngest Connect startup timed out after ${timeoutMs}ms`);
  error.name = "ConnectStartupTimeoutError";
  return error;
}

async function runConnectStartup(): Promise<void> {
  const attemptSerial = ++connectAttemptSerial;
  startupPhase = "connecting";
  startupFailureDiagnostic = null;

  logWorkerEvent({
    level: "info",
    message: "inngest_connect_connecting",
    inngest_connect_state: ConnectionState.CONNECTING,
  });

  const maxWorkerConcurrency = Number.parseInt(
    process.env.WORKER_INNGEST_MAX_CONCURRENCY?.trim() ?? "5",
    10,
  );
  const startupTimeoutMs = readConnectStartupTimeoutMs();

  let connection: WorkerConnection;
  try {
    connection = await Promise.race([
      connect({
        apps: [{ client: workerInngest, functions: [processStudyRunInngestFunction] }],
        instanceId: process.env.WORKER_INNGEST_INSTANCE_ID?.trim() || undefined,
        maxWorkerConcurrency: Number.isFinite(maxWorkerConcurrency) ? maxWorkerConcurrency : 5,
      }),
      new Promise<WorkerConnection>((_resolve, reject) => {
        setTimeout(() => reject(connectStartupTimeoutError(startupTimeoutMs)), startupTimeoutMs);
      }),
    ]);
  } catch (error: unknown) {
    if (attemptSerial === connectAttemptSerial) {
      recordStartupFailure(error);
    }
    throw error;
  }

  if (attemptSerial !== connectAttemptSerial) {
    return;
  }

  activeConnection = connection;
  startupPhase = "idle";

  logWorkerEvent({
    level: "info",
    message: "inngest_connect_active",
    inngest_connect_state: connection.state,
  });

  connection.closed
    .then(() => {
      logWorkerEvent({
        level: "info",
        message: "inngest_connect_closed",
        inngest_connect_state: ConnectionState.CLOSED,
      });
      activeConnection = null;
    })
    .catch((error: unknown) => {
      const sanitized = sanitizeConnectStartupError(error);
      logWorkerEvent({
        level: "error",
        message: "inngest_connect_closed_error",
        error_name: sanitized.error_name,
        diagnostic_detail: sanitized.message_safe,
        ...(sanitized.cause_safe ? { cause_safe: sanitized.cause_safe } : {}),
      });
      activeConnection = null;
    });
}

export async function startInngestConnect(): Promise<void> {
  if (!isInngestConnectConfigured()) {
    logWorkerEvent({
      level: "warn",
      message: "inngest_connect_disabled",
      diagnostic_detail: "Set INNGEST_SIGNING_KEY or INNGEST_DEV=1 to enable Connect.",
    });
    return;
  }

  if (connectStartupPromise) {
    return connectStartupPromise;
  }

  connectStartupPromise = runConnectStartup().finally(() => {
    connectStartupPromise = null;
  });

  return connectStartupPromise;
}

/** Test-only reset of module-local Connect startup state. */
export function resetInngestConnectStateForTests(): void {
  activeConnection = null;
  startupPhase = "idle";
  startupFailureDiagnostic = null;
  connectStartupPromise = null;
  connectAttemptSerial = 0;
}
