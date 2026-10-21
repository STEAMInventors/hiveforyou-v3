import "server-only";

import { getPublicSupabaseConfig } from "@/lib/config/public-supabase";

export type ServerEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  SUPABASE_HIVE_EDGE_FUNCTION: string;
  SUPABASE_DOCUMENT_EDGE_FUNCTION: string;
};

let cached: ServerEnv | null = null;

export function readServerEnv(): ServerEnv {
  if (cached) {
    return cached;
  }
  const { url, anonKey } = getPublicSupabaseConfig();
  cached = {
    supabaseUrl: url,
    supabaseAnonKey: anonKey,
    SUPABASE_HIVE_EDGE_FUNCTION: process.env.SUPABASE_HIVE_EDGE_FUNCTION?.trim() || "v1-hives",
    SUPABASE_DOCUMENT_EDGE_FUNCTION:
      process.env.SUPABASE_DOCUMENT_EDGE_FUNCTION?.trim() || "v1-documents",
  };
  return cached;
}
