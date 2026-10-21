export type AuthOtpPurpose = "signup" | "recovery";

export type AuthActionState = {
  error?: string;
  info?: string;
  unconfirmedEmail?: string;
  /** Set when recovery password update succeeded; client navigates to login. */
  passwordResetComplete?: boolean;
  /** Prompt for email OTP entry after a reset or confirmation email was accepted. */
  otpChallenge?: { purpose: AuthOtpPurpose; email: string };
};
