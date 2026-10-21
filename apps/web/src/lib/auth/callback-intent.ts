import { safeNextPath } from "./redirects";
import { RESET_PASSWORD_PATH, isRecoveryOtpType } from "./recovery";

const VERIFY_OTP_TYPES = new Set([
  "signup",
  "recovery",
  "invite",
  "magiclink",
  "email_change",
  "email",
]);

/** Whether this callback should finish on the password reset screen. */
export function callbackRecoveryIntent(input: {
  next: string | null;
  type: string | null;
}): boolean {
  if (safeNextPath(input.next, "/hives") === RESET_PASSWORD_PATH) {
    return true;
  }
  return isRecoveryOtpType(input.type);
}

export function callbackSuccessPath(recoveryIntent: boolean, next: string | null): string {
  if (recoveryIntent) {
    return RESET_PASSWORD_PATH;
  }
  return safeNextPath(next, "/hives");
}

/** Allowed Supabase email OTP types for token_hash verification (no arbitrary strings). */
export function safeEmailOtpType(value: string | null): string | null {
  if (!value?.trim()) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return VERIFY_OTP_TYPES.has(normalized) ? normalized : null;
}
