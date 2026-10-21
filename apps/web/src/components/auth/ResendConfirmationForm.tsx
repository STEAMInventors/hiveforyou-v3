"use client";

import { useActionState } from "react";

import { resendConfirmationAction } from "@/lib/auth/recovery-actions";
import type { AuthActionState } from "@/lib/auth/auth-state";

import { AuthField, AuthNotice, AuthSubmit } from "./auth-ui";

const initialState: AuthActionState = {};

export function ResendConfirmationForm({ email, nextPath }: { email: string; nextPath: string }) {
  const [state, formAction, pending] = useActionState(resendConfirmationAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={nextPath} />
      {state.error ? <AuthNotice tone="error">{state.error}</AuthNotice> : null}
      {state.info ? <AuthNotice tone="info">{state.info}</AuthNotice> : null}
      <AuthField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={email}
      />
      <AuthSubmit pending={pending} label="Resend confirmation email" pendingLabel="Sending…" />
    </form>
  );
}
