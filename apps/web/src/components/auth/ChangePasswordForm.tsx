"use client";

import { useActionState } from "react";

import type { AuthActionState } from "@/lib/auth/auth-state";
import { changePasswordAction } from "@/lib/auth/recovery-actions";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/auth/validation";

import { AuthField, AuthNotice, AuthSubmit } from "./auth-ui";

const initialState: AuthActionState = {};

export function ChangePasswordForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(changePasswordAction, initialState);
  const hint = `${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`;

  return (
    <>
      {state.error ? <AuthNotice tone="error">{state.error}</AuthNotice> : null}
      {state.info ? <AuthNotice tone="info">{state.info}</AuthNotice> : null}
      <form action={formAction} className="flex flex-col gap-4">
        <input className="sr-only" name="username" autoComplete="username" value={email} readOnly tabIndex={-1} aria-hidden />
        <AuthField
          label="Current password"
          name="current_password"
          type="password"
          autoComplete="current-password"
          required
        />
        <AuthField
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={MAX_PASSWORD_LENGTH}
          hint={hint}
        />
        <AuthField
          label="Confirm new password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={MAX_PASSWORD_LENGTH}
        />
        <AuthSubmit pending={pending} label="Change password" pendingLabel="Updating…" />
      </form>
    </>
  );
}
