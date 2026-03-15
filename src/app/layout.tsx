import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthBootstrap } from "@/components/AuthBootstrap";
import { Header } from "@/components/Header";
import { HtmlLangSync } from "@/components/HtmlLangSync";
import { MigrationGuard } from "@/components/MigrationGuard";
import { ProfileBootstrap } from "@/components/ProfileBootstrap";
import { RandomIdBanner } from "@/components/RandomIdBanner";
import { ActingAsProvider } from "@/context/ActingAsContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Abstract — Artist-centric community",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        translate="no"
      >
        <HtmlLangSync />
        <AuthBootstrap />
        <MigrationGuard />
        <ProfileBootstrap />
        <ActingAsProvider>
          <Header />
          <RandomIdBanner />
          {children}
        </ActingAsProvider>
      </body>
    </html>
  );
}
