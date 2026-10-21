"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type HiveCustomerNavProps = {
  variant?: "bar" | "drawer";
  onNavigate?: () => void;
};

export function HiveCustomerNav({ variant = "bar", onNavigate }: HiveCustomerNavProps) {
  const pathname = usePathname();
  const active = pathname === "/hives" || pathname.startsWith("/hives/");

  const linkClass = (isActive: boolean) =>
    isActive
      ? "rounded-full bg-[#EEF4FF] px-3.5 py-2 text-sm font-semibold text-[#2456B8] no-underline"
      : "rounded-full px-3.5 py-2 text-sm font-medium text-[#4A525C] no-underline hover:bg-[#F4F6F8]";

  const links = (
    <>
      <Link href="/hives" className={linkClass(active)} onClick={onNavigate}>
        My Hives
      </Link>
      <span className="rounded-full px-3.5 py-2 text-sm font-medium text-[#9AA0A6]">Explore Hive</span>
      <span className="rounded-full px-3.5 py-2 text-sm font-medium text-[#9AA0A6]">Help</span>
    </>
  );

  if (variant === "drawer") {
    return <div className="flex flex-col gap-1 py-2">{links}</div>;
  }

  return <nav className="hidden items-center gap-1 md:flex">{links}</nav>;
}
