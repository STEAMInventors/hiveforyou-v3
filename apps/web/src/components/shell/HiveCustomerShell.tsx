"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

import { HiveCustomerNav } from "@/components/shell/HiveCustomerNav";
import { HiveAppLogo } from "@/components/HiveWordmark";
import { signOutAction } from "@/lib/auth/actions";

function MenuIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

export function HiveCustomerShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const closeMobileNav = useCallback(() => {
    setMobileNavOpen(false);
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileNavOpen]);

  return (
    <div
      className="flex min-h-screen flex-col bg-[#F7F8FA] font-sans text-customerHive-on-surface antialiased"
      style={{ fontFamily: "Figtree, var(--font-dm-sans), sans-serif" }}
    >
      <header className="sticky top-0 z-50 border-b border-[#E8EAEE] bg-white">
        <div className="mx-auto flex h-14 max-w-[1160px] items-center gap-3 px-4 md:h-16 md:gap-7 md:px-8">
          <HiveAppLogo linkHome display="lockup" className="py-0.5" />
          <HiveCustomerNav />
          <div className="flex-1" aria-hidden />
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-[10px] text-customerHive-on-surface md:hidden"
            aria-expanded={mobileNavOpen}
            aria-controls="hive-customer-mobile-nav"
            aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            <MenuIcon open={mobileNavOpen} />
          </button>
          <form action={signOutAction} className="hidden md:block">
            <button
              type="submit"
              className="rounded-[10px] border border-[#E7E9ED] bg-white px-3 py-2 text-sm font-semibold text-[#1F2328] hover:bg-[#F4F6F8]"
            >
              Log out
            </button>
          </form>
        </div>

        {mobileNavOpen ? (
          <>
            <button
              type="button"
              className="fixed inset-0 top-14 z-40 bg-[#1F2328]/30 md:hidden"
              aria-label="Close menu"
              onClick={closeMobileNav}
            />
            <div
              id="hive-customer-mobile-nav"
              className="absolute left-0 right-0 top-full z-50 flex max-h-[calc(100vh-3.5rem)] flex-col overflow-auto border-b border-[#E8EAEE] bg-white px-4 py-2 shadow-[0_16px_32px_rgba(31,35,40,0.12)] md:hidden"
            >
              <HiveCustomerNav variant="drawer" onNavigate={closeMobileNav} />
              <form action={signOutAction} className="mt-2 border-t border-[#EEF0F3] pt-2">
                <button
                  type="submit"
                  className="w-full rounded-[10px] px-3 py-3 text-left text-sm font-semibold text-[#1F2328]"
                >
                  Log out
                </button>
              </form>
            </div>
          </>
        ) : null}
      </header>

      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
