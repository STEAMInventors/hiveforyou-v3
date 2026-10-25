import { handleGetStudyRunExtractionProgress } from "@/lib/api/study-run-routes";
import { CORRELATION_HEADER, resolveCorrelationId } from "@/lib/server/correlation";

type RouteContext = { params: Promise<{ hiveId: string; studyRunId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const correlationId = resolveCorrelationId(request.headers.get(CORRELATION_HEADER));
  const { hiveId, studyRunId } = await context.params;
  return handleGetStudyRunExtractionProgress(correlationId, hiveId, studyRunId);
}
