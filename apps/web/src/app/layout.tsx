import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono, Outfit, Source_Serif_4 } from "next/font/google";

import { brand } from "@/lib/brand/paths";

import "./globals.css";
import "@/styles/legacy/marketing-start.css";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-outfit",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-source-serif",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-dm-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HiveForYou — Start",
  description:
    "Upload what you have. Hive will organize the documents and build a clear picture of your case.",
  icons: {
    icon: [
      { url: brand.faviconIco, sizes: "48x48" },
      { url: brand.faviconSvg, type: "image/svg+xml" },
    ],
    apple: brand.appleTouchIcon,
  },
  openGraph: {
    images: [{ url: brand.ogImage, width: 1200, height: 630, alt: "HiveForYou" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${sourceSerif.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="flex min-h-dvh flex-col">{children}</body>
    </html>
  );
}
