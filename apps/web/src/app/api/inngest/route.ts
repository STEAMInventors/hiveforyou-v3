import { serve } from "inngest/next";

import { inngest } from "@/lib/inngest/client";

/** Event send only on Vercel; `hive3-process-study-run` executes on Oracle via Inngest Connect. */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [],
});
