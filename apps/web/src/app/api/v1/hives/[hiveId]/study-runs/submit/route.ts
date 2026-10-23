import { handleSubmitStudyProcessing } from "@/lib/api/study-run-routes";
import { CORRELATION_HEADER, resolveCorrelationId } from "@/lib/server/correlation";

type RouteContext = { params: Promise<{ hiveId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const correlationId = resolveCorrelationId(request.headers.get(CORRELATION_HEADER));
  const { hiveId } = await context.params;
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  return handleSubmitStudyProcessing(correlationId, hiveId, body);
}
