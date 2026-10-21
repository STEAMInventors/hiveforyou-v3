import { handleListDocuments } from "@/lib/api/document-routes";
import { CORRELATION_HEADER, resolveCorrelationId } from "@/lib/server/correlation";

type RouteContext = { params: Promise<{ hiveId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { hiveId } = await context.params;
  const correlationId = resolveCorrelationId(request.headers.get(CORRELATION_HEADER));
  return handleListDocuments(correlationId, hiveId);
}
