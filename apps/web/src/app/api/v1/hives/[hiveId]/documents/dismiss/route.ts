import { ErrorCategory, ErrorCode } from "@hiveforyou/contracts/errors/v1";

import { handleDismissFailedDocumentUpload } from "@/lib/api/document-routes";
import { jsonError } from "@/lib/server/api-response";
import { CORRELATION_HEADER, resolveCorrelationId } from "@/lib/server/correlation";

type RouteContext = { params: Promise<{ hiveId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { hiveId } = await context.params;
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
  return handleDismissFailedDocumentUpload(correlationId, hiveId, body);
}
