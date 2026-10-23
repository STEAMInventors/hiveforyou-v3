import { serve } from "inngest/next";

import { inngest } from "@/lib/inngest/client";
import { processStudyRunFunction } from "@/inngest/functions/process-study-run";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processStudyRunFunction],
});
