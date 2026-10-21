import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { safeNextPath } from "@/lib/auth/redirects";
import { readServerEnv } from "@/lib/server/env";

export async function GET(request: Request) {
  const env = readServerEnv();
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNextPath(requestUrl.searchParams.get("next"), "/hives");

  if (!code) {
    const login = new URL("/login", env.NEXT_PUBLIC_APP_URL);
    login.searchParams.set("error", "link_invalid");
    login.searchParams.set("next", next);
    return NextResponse.redirect(login);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const login = new URL("/login", env.NEXT_PUBLIC_APP_URL);
    login.searchParams.set("error", "link_invalid");
    login.searchParams.set("next", next);
    return NextResponse.redirect(login);
  }

  return NextResponse.redirect(new URL(next, env.NEXT_PUBLIC_APP_URL));
}
