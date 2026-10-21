"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { signOutAction } from "@/lib/auth/actions";
import type { AuthActionState } from "@/lib/auth/auth-state";
import { updatePasswordFromRecoveryAction } from "@/lib/auth/recovery-actions";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/auth/validation";

import { AuthField, AuthNotice, AuthSubmit } from "./auth-ui";

const initialState: AuthActionState = {};

export function ResetPasswordForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updatePasswordFromRecoveryAction, initialState);
  const hint = `${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`;

  useEffect(() => {
    if (state.passwordResetComplete) {
      router.replace("/login?info=password_updated");
    }
  }, [state.passwordResetComplete, router]);

  return (
    <>
      {state.error ? <AuthNotice tone="error">{state.error}</AuthNotice> : null}
      <form action={formAction} className="flex flex-col gap-4">
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
        <AuthSubmit pending={pending} label="Update password" pendingLabel="Updating…" />
      </form>
      <form action={signOutAction}>
        <button type="submit" className="text-sm font-semibold text-[#2456B8] underline">
          Log out and request a new link
        </button>
      </form>
    </>
  );
}
