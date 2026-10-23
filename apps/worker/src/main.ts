import { startWorkerHttpServer } from "./http/server.js";
import { startInngestConnect } from "./inngest/start-connect.js";

startWorkerHttpServer();
void startInngestConnect().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      level: "error",
      service: "worker",
      message: "inngest_connect_start_failed",
      diagnostic_detail: error instanceof Error ? error.message : "connect_start_error",
    }),
  );
  process.exitCode = 1;
});
