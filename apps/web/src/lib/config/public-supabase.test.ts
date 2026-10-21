import { describe, expect, it } from "vitest";

import {
  assertBrowserSafeSupabaseAnonKey,
  assertPublicSupabaseUrl,
  getPublicSupabaseConfig,
} from "./public-supabase";

describe("public Supabase configuration", () => {
  it("loads committed browser-safe credentials", () => {
    const config = getPublicSupabaseConfig();
    expect(config.url).toMatch(/^https:\/\/.*\.supabase\.co$/);
    expect(config.anonKey.startsWith("sb_publishable_")).toBe(true);
  });

  it("rejects service-role and secret keys", () => {
    expect(() => assertBrowserSafeSupabaseAnonKey("sb_secret_test")).toThrow(/secret/i);
    expect(() => assertBrowserSafeSupabaseAnonKey("service_role_key")).toThrow(/service-role/i);
  });

  it("rejects non-HTTPS Supabase URLs", () => {
    expect(() => assertPublicSupabaseUrl("http://evil.supabase.co")).toThrow(/HTTPS/i);
  });
});
