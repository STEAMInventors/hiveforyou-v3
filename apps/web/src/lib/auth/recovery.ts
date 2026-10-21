import { safeNextPath } from "./redirects";

export const RECOVERY_COOKIE_NAME = "hfy_recovery_password";
export const RECOVERY_NEXT_COOKIE_NAME = "hfy_recovery_next";
export const RESET_PASSWORD_PATH = "/reset-password";
export const FORGOT_PASSWORD_PATH = "/forgot-password";
export const ACCOUNT_PASSWORD_PATH = "/account/password";
export const RECOVERY_COOKIE_MAX_AGE_SECONDS = 15 * 60;

export function isRecoveryCookieValue(value: string | undefined): boolean {
  return value === "1";
}

export function recoveryNextCookieValue(path: string | null | undefined): string {
  const safe = safeNextPath(path, "/hives");
  return safe.length <= 512 ? safe : "/hives";
}

export function recoveryCookieIsSecure(): boolean {
  return process.env.NODE_ENV === "production";
}

export function recoveryCookieOptions(secure: boolean, maxAge = RECOVERY_COOKIE_MAX_AGE_SECONDS) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge,
  };
}
