import Link from "next/link";

import { LandingStart } from "@/components/landing/LandingStart";
import { HiveAppLogo, HiveBrandMark } from "@/components/HiveWordmark";

type StartLandingProps = {
  signedIn: boolean;
};

export function StartLanding({ signedIn }: StartLandingProps) {
  return (
    <div className="font-start flex min-h-dvh flex-col bg-[#FFFFFF] text-[#0D0D0D]">
      <header className="flex items-center justify-between gap-4 px-5 py-4">
        <HiveAppLogo linkHome display="lockup" className="py-0.5" />
        <div className="flex items-center gap-1">
          <Link
            href="#how"
            className="rounded-md px-3 py-2.5 text-sm text-[#3C4043] no-underline transition-colors hover:text-[#0D0D0D]"
          >
            How it works
          </Link>
          <Link
            href={signedIn ? "/hives" : "/login"}
            className="rounded-full bg-[#0D0D0D] px-4 py-2.5 text-sm font-medium text-white no-underline"
          >
            {signedIn ? "My Hives" : "Sign in"}
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-5 pb-12 pt-6">
        <div className="flex w-full max-w-[720px] flex-col items-center gap-7">
          <div className="flex flex-col items-center gap-3.5">
            <HiveBrandMark variant="hero" />
            <h1 className="m-0 text-center text-[clamp(1.75rem,5vw,2.25rem)] font-semibold tracking-tight">
              What are you working on?
            </h1>
          </div>

          <LandingStart signedIn={signedIn} />

          <div
            id="how"
            className="flex flex-wrap items-center justify-center gap-2.5 text-center text-sm text-[#5F6368]"
          >
            <span>Every answer points to its source</span>
            <span className="rounded-md border border-[#EBDDB4] bg-[#FBF4E2] px-2 py-1 font-mono text-xs text-[#3D3000]">
              IEP_Draft_2026.pdf · p.7
            </span>
            <span>and says what&apos;s missing. Nothing invented.</span>
          </div>
        </div>
      </main>

      <footer className="flex items-center justify-center gap-2 px-5 pb-6 pt-4 text-center text-[13px] text-[#5F6368]">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#5F6368"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="4" y="10" width="16" height="11" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
        Your documents stay private and are used only to build your case. Not legal or medical advice.
      </footer>
    </div>
  );
}
