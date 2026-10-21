import { ErrorCategory, ErrorCode } from "@hiveforyou/contracts/errors/v1";

import {
  handleCreateHive,
  handleListHives,
} from "@/lib/api/hive-routes";
import { jsonError } from "@/lib/server/api-response";
import { CORRELATION_HEADER, resolveCorrelationId } from "@/lib/server/correlation";

export async function GET(request: Request) {
  const correlationId = resolveCorrelationId(request.headers.get(CORRELATION_HEADER));
  return handleListHives(correlationId);
}

export async function POST(request: Request) {
  const correlationId = resolveCorrelationId(request.headers.get(CORRELATION_HEADER));
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(correlationId, {
      error_code: ErrorCode.INVALID_REQUEST,
      category: ErrorCategory.VALIDATION,
      message_safe: "Request body must be valid JSON.",
    });
  }
  return handleCreateHive(correlationId, body);
}
