import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { logAuthFailure, logAuthInfo } from "@/lib/auth/action-support";
import {
  callbackRecoveryIntent,
  callbackSuccessPath,
  safeEmailOtpType,
} from "@/lib/auth/callback-intent";
import { classifyAuthError, linkErrorCodeForKind, sanitizeDiagnostic, toAuthErrorInput } from "@/lib/auth/map-auth-error";
import {
  RECOVERY_COOKIE_NAME,
  recoveryCookieIsSecure,
  recoveryCookieOptions,
} from "@/lib/auth/recovery";
import { safeNextPath } from "@/lib/auth/redirects";
import { resolveAppOrigin } from "@/lib/config/app-origin";
import { getPublicSupabaseConfig } from "@/lib/config/public-supabase";
import { CORRELATION_HEADER, resolveCorrelationId } from "@/lib/correlation/constants";
import { readServerEnv } from "@/lib/server/env";

function safeProviderCode(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return sanitizeDiagnostic(normalized) === normalized ? normalized : undefined;
}

function failureRedirect(appOrigin: string, next: string, errorCode: string, recoveryIntent: boolean): URL {
  const destination = new URL(recoveryIntent ? "/forgot-password" : "/login", appOrigin);
  destination.searchParams.set("error", errorCode);
  if (!recoveryIntent) {
    destination.searchParams.set("next", next);
  }
  return destination;
}

function attachRecoveryCookie(response: NextResponse): void {
  const options = recoveryCookieOptions(recoveryCookieIsSecure());
  response.cookies.set(RECOVERY_COOKIE_NAME, "1", options);
}

export async function GET(request: Request) {
  readServerEnv();
  const correlationId = resolveCorrelationId(request.headers.get(CORRELATION_HEADER));
  const { url: supabaseUrl, anonKey } = getPublicSupabaseConfig();
  const appOrigin = resolveAppOrigin({ requestUrl: request.url });
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const otpTypeParam = requestUrl.searchParams.get("type");
  const safeOtpType = safeEmailOtpType(otpTypeParam);
  const nextParam = requestUrl.searchParams.get("next");
  const next = safeNextPath(nextParam, "/hives");
  const recoveryIntent = callbackRecoveryIntent({ next: nextParam, type: otpTypeParam });
  const providerCode =
    safeProviderCode(requestUrl.searchParams.get("error_code")) ??
    safeProviderCode(requestUrl.searchParams.get("error"));

  const sendFailure = (errorCode: string) => {
    const destination = failureRedirect(appOrigin, next, errorCode, recoveryIntent);
    return NextResponse.redirect(destination);
  };

  const hasPkceCode = Boolean(code);
  const hasTokenHash = Boolean(tokenHash && safeOtpType);

  if (!hasPkceCode && !hasTokenHash) {
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
  const successPath = callbackSuccessPath(recoveryIntent, nextParam);
  let response = NextResponse.redirect(new URL(successPath, appOrigin));

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const started = Date.now();
  try {
    if (hasPkceCode && code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      const durationMs = Date.now() - started;
      if (error) {
        const mapped = classifyAuthError(toAuthErrorInput(error), "callback");
        logAuthFailure("auth.callback", correlationId, mapped, durationMs);
        return sendFailure(linkErrorCodeForKind(mapped.kind));
      }
    } else if (tokenHash && safeOtpType) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: safeOtpType as EmailOtpType,
      });
      const durationMs = Date.now() - started;
      if (error) {
        const mapped = classifyAuthError(toAuthErrorInput(error), "callback");
        logAuthFailure("auth.callback", correlationId, mapped, durationMs);
        return sendFailure(linkErrorCodeForKind(mapped.kind));
      }
    }
  } catch (caught) {
    const mapped = classifyAuthError(toAuthErrorInput(caught), "callback");
    logAuthFailure("auth.callback", correlationId, mapped, Date.now() - started);
    return sendFailure(linkErrorCodeForKind(mapped.kind));
  }

  logAuthInfo(
    "auth.callback",
    correlationId,
    recoveryIntent ? "recovery_session" : "session_exchanged",
    Date.now() - started,
  );

  if (recoveryIntent) {
    attachRecoveryCookie(response);
    cookieStore.set(RECOVERY_COOKIE_NAME, "1", recoveryCookieOptions(recoveryCookieIsSecure()));
  }

  return response;
}
