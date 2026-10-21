import Link from "next/link";
import type { InputHTMLAttributes, ReactNode } from "react";

import { HiveAppLogo } from "@/components/HiveWordmark";

export function AuthPage({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-[#F7F8FA]">{children}</div>;
}

export function AuthFrame({ children }: { children: ReactNode }) {
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
        {children}
      </div>
    </div>
  );
}

export function AuthNotice({ tone, children }: { tone: "error" | "info"; children: ReactNode }) {
  if (tone === "info") {
    return (
      <p
        role="status"
        className="rounded-[10px] border border-[#D6E4FF] bg-[#EEF4FF] px-3.5 py-2.5 text-sm text-[#1F3F86]"
      >
        {children}
      </p>
    );
  }
  return (
    <p role="alert" className="rounded-[10px] border border-[#EF5143] bg-[#FDEDEB] px-3.5 py-2.5 text-sm text-[#B4352A]">
      {children}
    </p>
  );
}

export function AuthHeading({ title, lede }: { title: string; lede: string }) {
  return (
    <div>
      <h1 className="m-0 text-[28px] font-semibold tracking-[-0.02em] text-[#1F2328]">{title}</h1>
      <p className="mt-1 text-[15px] leading-relaxed text-[#4A525C]">{lede}</p>
    </div>
  );
}

type AuthFieldProps = {
  label: string;
  hint?: string;
} & InputHTMLAttributes<HTMLInputElement>;

export function AuthField({ label, hint, ...inputProps }: AuthFieldProps) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-semibold text-[#1F2328]">
      {label}
      <input
        {...inputProps}
        className="h-[46px] rounded-[10px] border border-[#D9DDE3] px-3.5 text-[15px] font-normal"
      />
      {hint ? <span className="text-xs font-normal text-[#6B7280]">{hint}</span> : null}
    </label>
  );
}

export function AuthSubmit({
  pending,
  label,
  pendingLabel,
}: {
  pending: boolean;
  label: string;
  pendingLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 rounded-[10px] border-0 bg-[#2F6FE4] text-[15px] font-semibold text-white hover:bg-[#2659C2] disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export function AuthCrossLinks({ nextPath, showForgot = false }: { nextPath: string; showForgot?: boolean }) {
  const next = encodeURIComponent(nextPath);
  return (
    <p className="m-0 text-center text-sm leading-relaxed text-[#4A525C]">
      <Link href={`/login?next=${next}`} className="font-semibold text-[#2456B8] underline">
        Log in
      </Link>
      <span aria-hidden> · </span>
      <Link href={`/register?next=${next}`} className="font-semibold text-[#2456B8] underline">
        Create an account
      </Link>
      {showForgot ? (
        <>
          <span aria-hidden> · </span>
          <Link href={`/forgot-password?next=${next}`} className="font-semibold text-[#2456B8] underline">
            Forgot password?
          </Link>
        </>
      ) : null}
    </p>
  );
}
