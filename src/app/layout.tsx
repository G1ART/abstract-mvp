import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { AuthBootstrap } from "@/components/AuthBootstrap";
import { Header } from "@/components/Header";
import { HtmlLangSync } from "@/components/HtmlLangSync";
import { MigrationGuard } from "@/components/MigrationGuard";
import { ProfileBootstrap } from "@/components/ProfileBootstrap";
import { RandomIdBanner } from "@/components/RandomIdBanner";
import { ActingAsProvider } from "@/context/ActingAsContext";
import { TourProvider } from "@/components/tour";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  adjustFontFallback: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// SUIT — the Theo brand UI typeface. Covers both Hangul and Latin, so it is
// the primary font for every locale. Self-hosted (next/font/local) with a
// subset of weights (300–800) that the design system actually uses.
const suit = localFont({
  variable: "--font-suit",
  display: "swap",
  src: [
    { path: "./fonts/SUIT-Light.otf", weight: "300", style: "normal" },
    { path: "./fonts/SUIT-Regular.otf", weight: "400", style: "normal" },
    { path: "./fonts/SUIT-Medium.otf", weight: "500", style: "normal" },
    { path: "./fonts/SUIT-SemiBold.otf", weight: "600", style: "normal" },
    { path: "./fonts/SUIT-Bold.otf", weight: "700", style: "normal" },
    { path: "./fonts/SUIT-ExtraBold.otf", weight: "800", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: "Theo — Artist-centric community",
  description: "Share works, connect with artists and collectors.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${suit.variable} ${geistSans.variable} ${geistMono.variable} antialiased`}
        translate="no"
      >
        <HtmlLangSync />
        <AuthBootstrap />
        <MigrationGuard />
        <ProfileBootstrap />
        <ActingAsProvider>
          <TourProvider>
            <Header />
            <RandomIdBanner />
            {children}
          </TourProvider>
        </ActingAsProvider>
      </body>
    </html>
  );
}
