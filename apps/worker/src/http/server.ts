import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { ErrorCategory } from "@hiveforyou/contracts/errors/v1";
import {
  WORKER_PROCESS_STUDY_RUN_PATH,
  type WorkerProcessStudyRunRequestV1,
} from "@hiveforyou/contracts/study-runs/v1";

import { getInngestConnectState } from "../inngest/start-connect.js";
import { ProcessStudyRunError, processStudyRun } from "../orchestration/process-study-run.js";
import {
  asPersistenceClient,
  createWorkerServiceClient,
} from "../persistence/supabase-service-client.js";
import { requireWorkerServiceToken, WorkerHttpAuthError } from "./auth.js";

const CORRELATION_HEADER = "x-correlation-id";
const STUDY_RUN_HEADER = "x-study-run-id";

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function writeJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string>,
): void {
  response.writeHead(status, { "Content-Type": "application/json", ...headers });
  response.end(JSON.stringify(body));
}

function errorEnvelope(input: {
  error_code: string;
  category: string;
  retryable: boolean;
  message_safe: string;
  correlation_id: string;
  study_run_id?: string;
}) {
  return {
    contract_version: "error-envelope@1",
    ...input,
  };
}

export function startWorkerHttpServer(): void {
  const port = Number.parseInt(process.env.WORKER_HTTP_PORT?.trim() ?? "8081", 10);

  const server = createServer(async (request, response) => {
    const correlationId =
      (request.headers[CORRELATION_HEADER] as string | undefined)?.trim() ||
      randomUUID();
    const studyRunHeader = (request.headers[STUDY_RUN_HEADER] as string | undefined)?.trim();

    try {
      if (request.method === "GET" && request.url === "/health") {
        writeJson(
          response,
          200,
          { status: "ok", inngest_connect_state: getInngestConnectState() },
          { [CORRELATION_HEADER]: correlationId },
        );
        return;
      }

      if (request.method === "POST" && request.url === WORKER_PROCESS_STUDY_RUN_PATH) {
        requireWorkerServiceToken(request.headers.authorization ?? null);
        const raw = await readBody(request);
        const body = JSON.parse(raw) as WorkerProcessStudyRunRequestV1;
        if (body.contract_version !== "worker-process-study-run@1") {
          writeJson(
            response,
            400,
            errorEnvelope({
              error_code: "INVALID_REQUEST",
              category: ErrorCategory.VALIDATION,
              retryable: false,
              message_safe: "Unsupported contract version.",
              correlation_id: correlationId,
              study_run_id: studyRunHeader,
            }),
            { [CORRELATION_HEADER]: correlationId },
          );
          return;
        }

        const supabase = createWorkerServiceClient();
        const result = await processStudyRun(asPersistenceClient(supabase), body);
        writeJson(response, 200, result, {
          [CORRELATION_HEADER]: correlationId,
          [STUDY_RUN_HEADER]: result.study_run_id,
        });
        return;
      }

      writeJson(
        response,
        404,
        errorEnvelope({
          error_code: "NOT_FOUND",
          category: ErrorCategory.NOT_FOUND,
          retryable: false,
          message_safe: "Route not found.",
          correlation_id: correlationId,
        }),
        { [CORRELATION_HEADER]: correlationId },
      );
    } catch (error) {
      if (error instanceof WorkerHttpAuthError) {
        writeJson(
          response,
          error.statusCode,
          errorEnvelope({
            error_code: error.errorCode,
            category: error.errorCode === "AUTH_FAILED" ? ErrorCategory.AUTH : ErrorCategory.DEPENDENCY,
            retryable: error.retryable,
            message_safe: error.messageSafe,
            correlation_id: correlationId,
            study_run_id: studyRunHeader,
          }),
          { [CORRELATION_HEADER]: correlationId },
        );
        return;
      }
      if (error instanceof ProcessStudyRunError) {
        const status = error.retryable ? 503 : 422;
        writeJson(
          response,
          status,
          errorEnvelope({
            error_code: error.errorCode,
            category: ErrorCategory.PROCESSING,
            retryable: error.retryable,
            message_safe: error.messageSafe,
            correlation_id: correlationId,
            study_run_id: studyRunHeader,
          }),
          { [CORRELATION_HEADER]: correlationId },
        );
        return;
      }
      writeJson(
        response,
        500,
        errorEnvelope({
          error_code: "DEPENDENCY_UNAVAILABLE",
          category: ErrorCategory.DEPENDENCY,
          retryable: true,
          message_safe: "Processing could not complete.",
          correlation_id: correlationId,
          study_run_id: studyRunHeader,
        }),
        { [CORRELATION_HEADER]: correlationId },
      );
    }
  });

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        level: "info",
        service: "worker",
        message: "worker_http_listening",
        port,
      }),
    );
  });
}
