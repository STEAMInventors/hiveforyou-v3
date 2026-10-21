export const SIGN_UP_CHECK_EMAIL_TITLE = "Check your email";

export const SIGN_UP_CHECK_EMAIL_BODY =
  "If this address can be used for a new account, we sent a confirmation link. Open it in this browser, then log in. If you already have an account, log in or reset your password.";

export const RESET_REQUEST_ACCEPTED =
  "If an account exists for that email, we sent a link to choose a new password. Open that link in this browser. If you use another device, request a new link there.";

export const RESEND_ACCEPTED =
  "If that email is waiting for confirmation, we sent another link. Check your inbox and spam folder, and open it in this browser.";

export const PASSWORD_UPDATED = "Your password is updated.";

export const INVALID_CREDENTIALS_MESSAGE =
  "That email or password is incorrect. Try again, or reset your password.";

export const EMAIL_NOT_CONFIRMED_MESSAGE =
  "Confirm your email before logging in. Check your inbox for the confirmation link, or send it again.";

export const AUTH_LINK_ERROR_CODES = [
  "link_expired",
  "link_reused",
  "link_invalid",
  "link_unavailable",
  "link_rate_limited",
] as const;

export type AuthLinkErrorCode = (typeof AUTH_LINK_ERROR_CODES)[number];

export function isAuthLinkErrorCode(value: string | null | undefined): value is AuthLinkErrorCode {
  return AUTH_LINK_ERROR_CODES.includes(value as AuthLinkErrorCode);
}

export function authLinkErrorMessage(
  code: string | null | undefined,
  surface: "login" | "recovery",
): string | null {
  if (!isAuthLinkErrorCode(code)) {
    return null;
  }
  if (surface === "recovery") {
    switch (code) {
      case "link_expired":
        return "That reset link has expired. Enter your email to send a new one.";
      case "link_reused":
        return "That reset link was already used, or it was opened in a different browser. Request a new one.";
      case "link_unavailable":
        return "We couldn't verify that link because the account service is unavailable. Try again in a few minutes.";
      case "link_rate_limited":
        return "Too many attempts to open that link. Wait a few minutes and try again.";
      case "link_invalid":
        return "That reset link is invalid or expired. Enter your email to send a new one.";
    }
  }
  switch (code) {
    case "link_expired":
      return "That link has expired. Request a new confirmation or password reset email.";
    case "link_reused":
      return "That link was already used, or it was opened in a different browser. Request a new one.";
    case "link_unavailable":
      return "We couldn't verify that link because the account service is unavailable. Try opening it again in a few minutes.";
    case "link_rate_limited":
      return "Too many attempts to open that link. Wait a few minutes and try again.";
    case "link_invalid":
      return "That link is invalid or expired. Request a new one, or log in with your password.";
  }
}
