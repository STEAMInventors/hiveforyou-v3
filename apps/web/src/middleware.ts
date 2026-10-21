import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { CORRELATION_HEADER, resolveCorrelationId } from "@/lib/correlation/constants";

const PROTECTED_PREFIXES = ["/hives"];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function safeNextPath(value: string | null, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }
  return value;
}

export async function middleware(request: NextRequest) {
  const correlationId = resolveCorrelationId(request.headers.get(CORRELATION_HEADER));
  let response = NextResponse.next({ request });
  response.headers.set(CORRELATION_HEADER, correlationId);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        response.headers.set(CORRELATION_HEADER, correlationId);
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const signedIn = Boolean(data.user);
  const { pathname, search } = request.nextUrl;

  if (pathname === "/case") {
    const redirect = new URL("/hives", request.url);
    return NextResponse.redirect(redirect, 308);
  }

  if (isProtectedPath(pathname) && !signedIn) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  if ((pathname === "/login" || pathname === "/register") && signedIn) {
    return NextResponse.redirect(new URL("/hives", request.url));
  }

  if (pathname === "/login" || pathname === "/register") {
    const next = request.nextUrl.searchParams.get("next");
    if (next && !next.startsWith("/")) {
      const cleaned = new URL(pathname, request.url);
      cleaned.searchParams.set("next", safeNextPath(null, "/hives"));
      return NextResponse.redirect(cleaned);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
