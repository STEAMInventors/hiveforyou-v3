"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createServerSupabaseClient, requireAuthenticatedUser } from "@/lib/supabase/server";

import {
  clearRecoveryCookies,
  logAuthFailure,
  logAuthInfo,
  rememberRecoveryNext,
  requestAppOrigin,
  requestCorrelationId,
} from "./action-support";
import type { AuthActionState } from "./auth-state";
import { classifyAuthError, localAuthFailure, publicAuthOutcome, toAuthErrorInput } from "./map-auth-error";
import { PASSWORD_UPDATED, RESEND_ACCEPTED, RESET_REQUEST_ACCEPTED } from "./messages";
import {
  isRecoveryCookieValue,
  recoveryNextCookieValue,
  RECOVERY_COOKIE_NAME,
  RECOVERY_NEXT_COOKIE_NAME,
  RESET_PASSWORD_PATH,
} from "./recovery";
import { safeNextPath } from "./redirects";
import { isPlausibleEmail, newPasswordIssue, newPasswordIssueMessage, normalizeEmail } from "./validation";

function providerFailure(
  route: string,
  correlationId: string,
  error: unknown,
  context: Parameters<typeof classifyAuthError>[1],
  started: number,
): AuthActionState {
  const mapped = classifyAuthError(toAuthErrorInput(error), context);
  logAuthFailure(route, correlationId, mapped, Date.now() - started);
  if (
    (context === "recovery_request" || context === "resend") &&
    publicAuthOutcome(context, mapped) === "neutral"
  ) {
    return { info: context === "resend" ? RESEND_ACCEPTED : RESET_REQUEST_ACCEPTED };
  }
  return { error: mapped.message };
}

export async function requestPasswordResetAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const next = safeNextPath(String(formData.get("next") ?? ""), "/hives");
  const correlationId = await requestCorrelationId();
  const route = "auth.reset_request";

  if (!isPlausibleEmail(email)) {
    const mapped = localAuthFailure("email_invalid", "Enter a valid email address.");
    logAuthFailure(route, correlationId, mapped);
    return { error: mapped.message };
  }

  const appOrigin = await requestAppOrigin();
  const supabase = await createServerSupabaseClient();
  const started = Date.now();
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appOrigin}/auth/callback?next=${encodeURIComponent(RESET_PASSWORD_PATH)}`,
    });
    const durationMs = Date.now() - started;
    if (error) {
      const mapped = classifyAuthError(toAuthErrorInput(error), "recovery_request");
      if (publicAuthOutcome("recovery_request", mapped) === "neutral") {
        await rememberRecoveryNext(next);
        logAuthInfo(route, correlationId, "reset_email_accepted", durationMs);
        return { info: RESET_REQUEST_ACCEPTED };
      }
      logAuthFailure(route, correlationId, mapped, durationMs);
      return { error: mapped.message };
    }
  } catch (caught) {
    const failure = providerFailure(route, correlationId, caught, "recovery_request", started);
    if (failure.info) {
      await rememberRecoveryNext(next);
    }
    return failure;
  }

  await rememberRecoveryNext(next);
  logAuthInfo(route, correlationId, "reset_email_accepted", Date.now() - started);
  return { info: RESET_REQUEST_ACCEPTED };
}

export async function resendConfirmationAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const next = safeNextPath(String(formData.get("next") ?? ""), "/hives");
  const correlationId = await requestCorrelationId();
  const route = "auth.resend_confirmation";

  if (!isPlausibleEmail(email)) {
    const mapped = localAuthFailure("email_invalid", "Enter a valid email address.");
    logAuthFailure(route, correlationId, mapped);
    return { error: mapped.message };
  }

  const appOrigin = await requestAppOrigin();
  const supabase = await createServerSupabaseClient();
  const started = Date.now();
  try {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${appOrigin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    const durationMs = Date.now() - started;
    if (error) {
      const mapped = classifyAuthError(toAuthErrorInput(error), "resend");
      if (publicAuthOutcome("resend", mapped) === "neutral") {
        logAuthInfo(route, correlationId, "confirmation_resend_accepted", durationMs);
        return { info: RESEND_ACCEPTED };
      }
      logAuthFailure(route, correlationId, mapped, durationMs);
      return { error: mapped.message };
    }
  } catch (caught) {
    return providerFailure(route, correlationId, caught, "resend", started);
  }

  logAuthInfo(route, correlationId, "confirmation_resend_accepted", Date.now() - started);
  return { info: RESEND_ACCEPTED };
}

export async function updatePasswordFromRecoveryAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const correlationId = await requestCorrelationId();
  const route = "auth.reset_password";
  const cookieStore = await cookies();

  if (!isRecoveryCookieValue(cookieStore.get(RECOVERY_COOKIE_NAME)?.value)) {
    const mapped = localAuthFailure(
      "recovery_cookie_missing",
      "Open the reset link from your email again, or change your password from your account.",
    );
    logAuthFailure(route, correlationId, mapped);
    return { error: mapped.message };
  }

  const issue = newPasswordIssue(password, confirm);
  if (issue) {
    const mapped = localAuthFailure(
      issue === "mismatch" ? "password_mismatch" : issue === "missing" ? "password_missing" : "password_policy",
      newPasswordIssueMessage(issue),
    );
    logAuthFailure(route, correlationId, mapped);
    return { error: mapped.message };
  }

  const auth = await requireAuthenticatedUser();
  if (!auth.ok) {
    await clearRecoveryCookies();
    const mapped = localAuthFailure(
      "session_missing",
      "Your session expired. Request a new reset link, or log in again.",
    );
    logAuthFailure(route, correlationId, mapped);
    return { error: mapped.message };
  }

  const supabase = await createServerSupabaseClient();
  const started = Date.now();
  try {
    const { error } = await supabase.auth.updateUser({ password });
    const durationMs = Date.now() - started;
    if (error) {
      const mapped = classifyAuthError(toAuthErrorInput(error), "password_update");
      if (mapped.kind === "session_expired") {
        await clearRecoveryCookies();
      }
      logAuthFailure(route, correlationId, mapped, durationMs);
      return { error: mapped.message };
    }
  } catch (caught) {
    return providerFailure(route, correlationId, caught, "password_update", started);
  }

  const next = recoveryNextCookieValue(cookieStore.get(RECOVERY_NEXT_COOKIE_NAME)?.value);
  await clearRecoveryCookies();
  logAuthInfo(route, correlationId, "password_updated", Date.now() - started);
  redirect(next);
}

export async function changePasswordAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const currentPassword = String(formData.get("current_password") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const correlationId = await requestCorrelationId();
  const route = "auth.change_password";

  if (!currentPassword) {
    const mapped = localAuthFailure("password_missing", "Enter your current password.");
    logAuthFailure(route, correlationId, mapped);
    return { error: mapped.message };
  }

  const issue = newPasswordIssue(password, confirm);
  if (issue) {
    const mapped = localAuthFailure(
      issue === "mismatch" ? "password_mismatch" : issue === "missing" ? "password_missing" : "password_policy",
      newPasswordIssueMessage(issue),
    );
    logAuthFailure(route, correlationId, mapped);
    return { error: mapped.message };
  }

  const auth = await requireAuthenticatedUser();
  if (!auth.ok) {
    const mapped = localAuthFailure(
      "session_missing",
      "Your session expired. Log in again, then change your password.",
    );
    logAuthFailure(route, correlationId, mapped);
    return { error: mapped.message };
  }

  const supabase = await createServerSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const email = userData.user?.email ? normalizeEmail(userData.user.email) : "";
  if (userError || !isPlausibleEmail(email)) {
    const mapped = userError
      ? classifyAuthError(toAuthErrorInput(userError), "password_update")
      : localAuthFailure("session_missing", "Your session expired. Log in again, then change your password.");
    logAuthFailure(route, correlationId, mapped);
    return { error: mapped.message };
  }

  const started = Date.now();
  try {
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (reauthError) {
      const mapped = classifyAuthError(toAuthErrorInput(reauthError), "password_update");
      logAuthFailure(route, correlationId, mapped, Date.now() - started);
      return { error: mapped.message };
    }

    if (password === currentPassword) {
      const mapped = classifyAuthError({ code: "same_password" }, "password_update");
      logAuthFailure(route, correlationId, mapped, Date.now() - started);
      return { error: mapped.message };
    }

    const { error } = await supabase.auth.updateUser({ password });
    const durationMs = Date.now() - started;
    if (error) {
      const mapped = classifyAuthError(toAuthErrorInput(error), "password_update");
      logAuthFailure(route, correlationId, mapped, durationMs);
      return { error: mapped.message };
    }
  } catch (caught) {
    return providerFailure(route, correlationId, caught, "password_update", started);
  }

  await clearRecoveryCookies();
  logAuthInfo(route, correlationId, "password_updated", Date.now() - started);
  return { info: PASSWORD_UPDATED };
}
