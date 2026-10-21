"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import type { AuthActionState } from "@/lib/auth/auth-state";
import { requestPasswordResetAction } from "@/lib/auth/recovery-actions";
import { SIGN_IN_HELP_PATH } from "@/lib/auth/recovery";

import { EmailOtpForm } from "./EmailOtpForm";
import { AuthCrossLinks, AuthField, AuthNotice, AuthSubmit } from "./auth-ui";

const initialState: AuthActionState = {};

export function ForgotPasswordForm({ nextPath, linkError }: { nextPath: string; linkError?: string | null }) {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initialState);
  const [email, setEmail] = useState("");
  const showOtp = Boolean(state.otpChallenge) || Boolean(state.info);

  return (
    <>
      {linkError ? <AuthNotice tone="error">{linkError}</AuthNotice> : null}
      {state.error ? <AuthNotice tone="error">{state.error}</AuthNotice> : null}
      {state.info ? <AuthNotice tone="info">{state.info}</AuthNotice> : null}
      {!showOtp ? (
        <form action={formAction} className="flex flex-col gap-4">
          <AuthField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <AuthSubmit pending={pending} label="Send reset email" pendingLabel="Sending…" />
        </form>
      ) : null}
      {showOtp ? (
        <EmailOtpForm
          purpose="recovery"
          email={state.otpChallenge?.email ?? email}
          nextPath={nextPath}
          codeLabel="Reset code"
        />
      ) : null}
      <p className="m-0 text-center text-sm text-[#4A525C]">
        <Link href={SIGN_IN_HELP_PATH} className="font-semibold text-[#2456B8] underline">
          Forgot which email you used?
        </Link>
      </p>
      <AuthCrossLinks nextPath={nextPath} />
    </>
  );
}
