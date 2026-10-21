"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { HiveAppLogo } from "@/components/HiveWordmark";
import { signInAction, signUpAction, type AuthActionState } from "@/lib/auth/actions";
import { safeNextPath } from "@/lib/auth/redirects";

type AuthMode = "login" | "register";

type AuthCardProps = {
  mode: AuthMode;
  nextPath: string;
  checkEmail?: boolean;
  linkError?: string | null;
};

const initialState: AuthActionState = {};

export function AuthCard({ mode, nextPath, checkEmail = false, linkError = null }: AuthCardProps) {
  const [tab, setTab] = useState<AuthMode>(mode);
  const action = tab === "login" ? signInAction : signUpAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const safeNext = safeNextPath(nextPath, "/hives");

  const passwordHint = useMemo(() => {
    return "At least 10 characters.";
  }, []);

  if (checkEmail) {
    return (
      <div className="mx-auto flex w-full max-w-[440px] flex-col gap-5 px-4 py-10">
        <div className="flex justify-center">
          <HiveAppLogo display="lockup" />
        </div>
        <div className="rounded-[20px] border border-[#E7E9ED] bg-white px-9 py-9 shadow-[0_1px_2px_rgba(31,35,40,0.04),0_8px_28px_rgba(31,35,40,0.06)]">
          <h1 className="m-0 text-[1.75rem] font-semibold tracking-tight text-[#1F2328]">Check your email</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-[#4A525C]">
            We sent a confirmation link. Open it to finish creating your account, then return here to
            sign in.
          </p>
          <Link
            href={`/login?next=${encodeURIComponent(safeNext)}`}
            className="mt-6 inline-flex h-11 items-center justify-center rounded-[10px] bg-[#2F6FE4] px-5 text-[15px] font-semibold text-white no-underline hover:bg-[#2456B8]"
          >
            Back to log in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mx-auto flex w-full max-w-[440px] flex-col gap-5 px-4 py-10"
      style={{ fontFamily: "Figtree, var(--font-dm-sans), sans-serif" }}
    >
      <div className="flex justify-center">
        <Link href="/" className="no-underline">
          <HiveAppLogo display="lockup" />
        </Link>
      </div>

      <div className="flex flex-col gap-5 rounded-[20px] border border-[#E7E9ED] bg-white px-9 py-9 shadow-[0_1px_2px_rgba(31,35,40,0.04),0_8px_28px_rgba(31,35,40,0.06)]">
        {linkError ? (
          <p className="rounded-[10px] border border-[#EF5143] bg-[#FDEDEB] px-3.5 py-2.5 text-sm text-[#B4352A]">
            {linkError}
          </p>
        ) : null}
        {state.error ? (
          <p className="rounded-[10px] border border-[#EF5143] bg-[#FDEDEB] px-3.5 py-2.5 text-sm text-[#B4352A]">
            {state.error}
          </p>
        ) : null}

        {tab === "login" ? (
          <>
            <div>
              <h1 className="m-0 text-[28px] font-semibold tracking-[-0.02em] text-[#1F2328]">Welcome back</h1>
              <p className="mt-1 text-[15px] text-[#4A525C]">Log in to your Hives.</p>
            </div>
            <form action={formAction} className="flex flex-col gap-4">
              <input type="hidden" name="next" value={safeNext} />
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-[#1F2328]">
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  className="h-[46px] rounded-[10px] border border-[#D9DDE3] px-3.5 text-[15px] font-normal"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-[#1F2328]">
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="h-[46px] rounded-[10px] border border-[#D9DDE3] px-3.5 text-[15px] font-normal"
                />
              </label>
              <button
                type="submit"
                disabled={pending}
                className="h-11 rounded-[10px] border-0 bg-[#2F6FE4] text-[15px] font-semibold text-white hover:bg-[#2659C2] disabled:opacity-60"
              >
                {pending ? "Logging in…" : "Log in"}
              </button>
            </form>
            <p className="m-0 text-center text-sm text-[#4A525C]">
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent p-0 text-[#2456B8] underline"
                onClick={() => setTab("register")}
              >
                Create an account
              </button>
            </p>
          </>
        ) : (
          <>
            <div>
              <h1 className="m-0 text-[28px] font-semibold tracking-[-0.02em] text-[#1F2328]">
                Create your account
              </h1>
              <p className="mt-1 text-[15px] text-[#4A525C]">
                It takes a minute. You can add documents right after.
              </p>
            </div>
            <form action={formAction} className="flex flex-col gap-4">
              <input type="hidden" name="next" value={safeNext} />
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-[#1F2328]">
                Your name
                <input
                  name="name"
                  type="text"
                  autoComplete="name"
                  className="h-[46px] rounded-[10px] border border-[#D9DDE3] px-3.5 text-[15px] font-normal"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-[#1F2328]">
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  className="h-[46px] rounded-[10px] border border-[#D9DDE3] px-3.5 text-[15px] font-normal"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-[#1F2328]">
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={10}
                  className="h-[46px] rounded-[10px] border border-[#D9DDE3] px-3.5 text-[15px] font-normal"
                />
                <span className="text-xs font-normal text-[#6B7280]">{passwordHint}</span>
              </label>
              <button
                type="submit"
                disabled={pending}
                className="h-11 rounded-[10px] border-0 bg-[#2F6FE4] text-[15px] font-semibold text-white hover:bg-[#2659C2] disabled:opacity-60"
              >
                {pending ? "Creating…" : "Create account"}
              </button>
            </form>
            <p className="m-0 text-center text-sm text-[#4A525C]">
              Already have an account?{" "}
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent p-0 text-[#2456B8] underline"
                onClick={() => setTab("login")}
              >
                Log in
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
