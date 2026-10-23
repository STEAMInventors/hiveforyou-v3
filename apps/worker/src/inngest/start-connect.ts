import { connect, ConnectionState, type WorkerConnection } from "inngest/connect";

import { workerInngest } from "./client.js";
import { processStudyRunInngestFunction } from "./functions/process-study-run.js";
import { logWorkerEvent } from "./log.js";

let activeConnection: WorkerConnection | null = null;

export function getInngestConnectState(): ConnectionState | "DISABLED" {
  if (!activeConnection) {
    return "DISABLED";
  }
  return activeConnection.state;
}

export function isInngestConnectConfigured(): boolean {
  if (process.env.INNGEST_DEV?.trim() === "1") {
    return true;
  }
  return Boolean(process.env.INNGEST_SIGNING_KEY?.trim());
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

  const maxWorkerConcurrency = Number.parseInt(
    process.env.WORKER_INNGEST_MAX_CONCURRENCY?.trim() ?? "5",
    10,
  );

  const connection = await connect({
    apps: [{ client: workerInngest, functions: [processStudyRunInngestFunction] }],
    instanceId: process.env.WORKER_INNGEST_INSTANCE_ID?.trim() || undefined,
    maxWorkerConcurrency: Number.isFinite(maxWorkerConcurrency) ? maxWorkerConcurrency : 5,
  });

  activeConnection = connection;

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
      logWorkerEvent({
        level: "error",
        message: "inngest_connect_closed_error",
        diagnostic_detail: error instanceof Error ? error.message : "connect_close_error",
      });
      activeConnection = null;
    });
}
