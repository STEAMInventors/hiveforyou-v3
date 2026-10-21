import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { classifyAuthError, linkErrorCodeForKind, sanitizeDiagnostic, toAuthErrorInput } from "@/lib/auth/map-auth-error";
import {
  RECOVERY_COOKIE_NAME,
  RESET_PASSWORD_PATH,
  recoveryCookieIsSecure,
  recoveryCookieOptions,
} from "@/lib/auth/recovery";
import { safeNextPath } from "@/lib/auth/redirects";
import { resolveAppOrigin } from "@/lib/config/app-origin";
import { getPublicSupabaseConfig } from "@/lib/config/public-supabase";
import { CORRELATION_HEADER, resolveCorrelationId } from "@/lib/correlation/constants";
import { logAuthFailure, logAuthInfo } from "@/lib/auth/action-support";
import { readServerEnv } from "@/lib/server/env";

function safeProviderCode(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return sanitizeDiagnostic(normalized) === normalized ? normalized : undefined;
}

function failureRedirect(appOrigin: string, next: string, errorCode: string): URL {
  const onRecovery = next === RESET_PASSWORD_PATH;
  const destination = new URL(onRecovery ? "/forgot-password" : "/login", appOrigin);
  destination.searchParams.set("error", errorCode);
  if (!onRecovery) {
    destination.searchParams.set("next", next);
  }
  return destination;
}

export async function GET(request: Request) {
  readServerEnv();
  const correlationId = resolveCorrelationId(request.headers.get(CORRELATION_HEADER));
  const { url: supabaseUrl, anonKey } = getPublicSupabaseConfig();
  const appOrigin = resolveAppOrigin({ requestUrl: request.url });
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNextPath(requestUrl.searchParams.get("next"), "/hives");
  const providerCode =
    safeProviderCode(requestUrl.searchParams.get("error_code")) ??
    safeProviderCode(requestUrl.searchParams.get("error"));

  const sendFailure = (errorCode: string) => {
    const destination = failureRedirect(appOrigin, next, errorCode);
    return NextResponse.redirect(destination);
  };

  if (!code) {
    const mapped = classifyAuthError(
      { code: providerCode, status: providerCode ? 400 : undefined },
      "callback",
    );
    const linkCode = providerCode ? linkErrorCodeForKind(mapped.kind) : "link_invalid";
    logAuthFailure(
      "auth.callback",
      correlationId,
      providerCode
        ? mapped
        : { ...mapped, kind: "link_invalid", diagnostic: "missing_code", message: mapped.message },
    );
    return sendFailure(linkCode);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, anonKey, {
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
  });

  const started = Date.now();
  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    const durationMs = Date.now() - started;
    if (error) {
      const mapped = classifyAuthError(toAuthErrorInput(error), "callback");
      logAuthFailure("auth.callback", correlationId, mapped, durationMs);
      return sendFailure(linkErrorCodeForKind(mapped.kind));
    }
  } catch (caught) {
    const mapped = classifyAuthError(toAuthErrorInput(caught), "callback");
    logAuthFailure("auth.callback", correlationId, mapped, Date.now() - started);
    return sendFailure(linkErrorCodeForKind(mapped.kind));
  }

  logAuthInfo(
    "auth.callback",
    correlationId,
    next === RESET_PASSWORD_PATH ? "recovery_session" : "session_exchanged",
    Date.now() - started,
  );

  const response = NextResponse.redirect(new URL(next, appOrigin));
  if (next === RESET_PASSWORD_PATH) {
    const options = recoveryCookieOptions(recoveryCookieIsSecure());
    cookieStore.set(RECOVERY_COOKIE_NAME, "1", options);
    response.cookies.set(RECOVERY_COOKIE_NAME, "1", options);
  }
  return response;
}
