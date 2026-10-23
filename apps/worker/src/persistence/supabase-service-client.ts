import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { StudyRunPersistenceClient } from "./study-run-persistence.js";

export function createWorkerServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Worker persistence.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function asPersistenceClient(client: SupabaseClient): StudyRunPersistenceClient {
  return {
    async rpc(fn, args) {
      return client.rpc(fn, args);
    },
  };
}
