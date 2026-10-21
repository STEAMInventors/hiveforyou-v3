import { notFound } from "next/navigation";

import { HiveWorkspace } from "@/components/workspace/HiveWorkspace";
import { getHiveForUser } from "@/lib/hives/service";
import { parseHiveIdParam } from "@/lib/hives/validation";
import { resolveCorrelationId } from "@/lib/server/correlation";
import { createServerSupabaseClient, requireAuthenticatedUser } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ hiveId: string }>;
};

export default async function HiveDetailPage({ params }: PageProps) {
  const { hiveId } = await params;
  if (!parseHiveIdParam(hiveId)) {
    notFound();
  }

  const auth = await requireAuthenticatedUser();
  if (!auth.ok) {
    notFound();
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || data.user.id !== auth.userId) {
    notFound();
  }

  const correlationId = resolveCorrelationId(null);
  const result = await getHiveForUser(supabase, hiveId, correlationId);
  if (!result.ok) {
    notFound();
  }

  return <HiveWorkspace hive={result.body.hive} />;
}
