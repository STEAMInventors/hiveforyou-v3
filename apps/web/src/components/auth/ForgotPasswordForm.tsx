"use client";

import { useActionState, useState } from "react";

import type { AuthActionState } from "@/lib/auth/auth-state";
import { requestPasswordResetAction } from "@/lib/auth/recovery-actions";

import { AuthCrossLinks, AuthField, AuthNotice, AuthSubmit } from "./auth-ui";

const initialState: AuthActionState = {};

export function ForgotPasswordForm({ nextPath, linkError }: { nextPath: string; linkError?: string | null }) {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initialState);
  const [email, setEmail] = useState("");

  return (
    <>
      {linkError ? <AuthNotice tone="error">{linkError}</AuthNotice> : null}
      {state.error ? <AuthNotice tone="error">{state.error}</AuthNotice> : null}
      {state.info ? <AuthNotice tone="info">{state.info}</AuthNotice> : null}
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={nextPath} />
        <AuthField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <AuthSubmit pending={pending} label="Send reset link" pendingLabel="Sending…" />
      </form>
      <AuthCrossLinks nextPath={nextPath} />
    </>
  );
}
