/** Browser-safe Supabase project URL and publishable (anon) key — safe to commit. */
export const PUBLIC_SUPABASE_URL = "https://ejodkbnctrzwyaqgulvj.supabase.co";

export const PUBLIC_SUPABASE_ANON_KEY =
  "sb_publishable_ICl6N0Tl3XoIxYQd98mxBg_rm-jpgWu";

export type PublicSupabaseConfig = {
  url: string;
  anonKey: string;
};

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }
  try {
    const json = Buffer.from(parts[1]!, "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Ensures the configured key is a browser-safe anon/publishable key, not a secret. */
export function assertBrowserSafeSupabaseAnonKey(key: string): void {
  const trimmed = key.trim();
  if (!trimmed) {
    throw new Error("Public Supabase anon key is empty.");
  }
  const lower = trimmed.toLowerCase();
  if (lower.includes("service_role") || trimmed.startsWith("sb_secret_")) {
    throw new Error("Public Supabase configuration must not use a secret or service-role key.");
  }
  if (trimmed.startsWith("sb_publishable_")) {
    return;
  }
  if (trimmed.startsWith("eyJ")) {
    const payload = decodeJwtPayload(trimmed);
    const role = payload?.role;
    if (role === "anon") {
      return;
    }
    throw new Error("Public Supabase JWT key must have role anon.");
  }
  throw new Error("Public Supabase anon key format is not recognized as browser-safe.");
}

export function assertPublicSupabaseUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error("Public Supabase URL is not a valid URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Public Supabase URL must use HTTPS.");
  }
  if (!parsed.hostname.endsWith(".supabase.co")) {
    throw new Error("Public Supabase URL must be a supabase.co project URL.");
  }
}

let cached: PublicSupabaseConfig | null = null;

export function getPublicSupabaseConfig(): PublicSupabaseConfig {
  if (cached) {
    return cached;
  }
  assertPublicSupabaseUrl(PUBLIC_SUPABASE_URL);
  assertBrowserSafeSupabaseAnonKey(PUBLIC_SUPABASE_ANON_KEY);
  cached = {
    url: PUBLIC_SUPABASE_URL.trim(),
    anonKey: PUBLIC_SUPABASE_ANON_KEY.trim(),
  };
  return cached;
}
