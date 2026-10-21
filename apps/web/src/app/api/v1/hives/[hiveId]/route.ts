import { handleGetHive } from "@/lib/api/hive-routes";
import { CORRELATION_HEADER, resolveCorrelationId } from "@/lib/server/correlation";

type RouteContext = { params: Promise<{ hiveId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const correlationId = resolveCorrelationId(request.headers.get(CORRELATION_HEADER));
  const { hiveId } = await context.params;
  return handleGetHive(correlationId, hiveId);
}
