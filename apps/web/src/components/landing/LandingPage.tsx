"use client";

import { useEffect, useState } from "react";

import { StartLanding } from "@/components/landing/StartLanding";
import { readBrowserAuthSignedIn } from "@/lib/supabase/browser-session";

export function LandingPage() {
  const [signedIn, setSignedIn] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void readBrowserAuthSignedIn().then((value) => {
      setSignedIn(value);
      setReady(true);
    });
  }, []);

  if (!ready) {
    return (
      <div className="font-start flex min-h-dvh items-center justify-center bg-white text-sm text-[#5F6368]">
        Loading…
      </div>
    );
  }

  return <StartLanding signedIn={signedIn} />;
}
