import { startWorkerHttpServer } from "./http/server.js";
import { logWorkerEvent } from "./inngest/log.js";
import { getInngestConnectStartupDiagnostic, startInngestConnect } from "./inngest/start-connect.js";

startWorkerHttpServer();
void startInngestConnect().catch(() => {
  logWorkerEvent({
    level: "error",
    message: "inngest_connect_start_failed",
    inngest_connect_state: "FAILED",
    diagnostic_detail: getInngestConnectStartupDiagnostic() ?? "connect_start_error",
  });
  process.exitCode = 1;
});
