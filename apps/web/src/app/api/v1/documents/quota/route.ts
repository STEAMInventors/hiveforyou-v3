import { handleGetUploadQuota } from "@/lib/api/document-routes";
import { CORRELATION_HEADER, resolveCorrelationId } from "@/lib/server/correlation";

export async function GET(request: Request) {
  const correlationId = resolveCorrelationId(request.headers.get(CORRELATION_HEADER));
  return handleGetUploadQuota(correlationId);
}
