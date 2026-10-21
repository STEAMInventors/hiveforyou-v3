"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { brandLogoSize } from "@/lib/brand/sizes";
import { brand } from "@/lib/brand/paths";

type HiveAppLogoProps = {
  className?: string;
  linkHome?: boolean;
  display?: "lockup" | "mark" | "responsive";
};

const headerH = brandLogoSize.headerHeightPx;
const logoLockupStyle = { height: headerH, width: "auto", maxHeight: headerH, display: "block" as const };
const logoMarkStyle = {
  height: headerH,
  width: headerH,
  maxHeight: headerH,
  maxWidth: headerH,
  display: "block" as const,
};

function HiveHomeLink({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Link
      href="/"
      data-testid="hive-home-link"
      aria-label="Back to start"
      className={`inline-flex shrink-0 cursor-pointer no-underline ${className ?? ""}`.trim()}
    >
      {children}
    </Link>
  );
}

export function HiveAppLogo({
  className = "",
  linkHome = false,
  display = "responsive",
}: HiveAppLogoProps) {
  const inner =
    display === "lockup" ? (
      <span className={`inline-flex items-center ${className}`.trim()}>
        <img src={brand.logo} alt="HiveForYou" style={logoLockupStyle} className="hfy-brand-header-logo" />
      </span>
    ) : display === "mark" ? (
      <span className={`inline-flex items-center ${className}`.trim()}>
        <img src={brand.mark} alt="HiveForYou" style={logoMarkStyle} className="hfy-brand-header-mark" />
      </span>
    ) : (
      <span className={`inline-flex items-center ${className}`.trim()}>
        <img
          src={brand.logo}
          alt="HiveForYou"
          style={logoLockupStyle}
          className="hfy-brand-header-logo hidden min-[400px]:block"
        />
        <img
          src={brand.mark}
          alt="HiveForYou"
          style={logoMarkStyle}
          className="hfy-brand-header-mark block min-[400px]:hidden"
        />
      </span>
    );

  if (linkHome) {
    return <HiveHomeLink>{inner}</HiveHomeLink>;
  }
  return inner;
}

export function HiveBrandMark({
  className = "",
  variant = "standalone",
}: {
  className?: string;
  variant?: "standalone" | "hero" | "footer";
}) {
  const px =
    variant === "hero"
      ? brandLogoSize.markHeroPx
      : variant === "footer"
        ? brandLogoSize.markFooterPx
        : brandLogoSize.markStandalonePx;
  return (
    <img
      src={brand.mark}
      alt=""
      aria-hidden
      style={{ width: px, height: px, maxWidth: px, maxHeight: px, display: "block" }}
      className={`hfy-brand-mark shrink-0 ${className}`.trim()}
    />
  );
}
