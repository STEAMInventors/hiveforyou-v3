export type AuthActionState = {
  error?: string;
  info?: string;
  unconfirmedEmail?: string;
  /** Set when recovery password update succeeded; client navigates to login. */
  passwordResetComplete?: boolean;
};
