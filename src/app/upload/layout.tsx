"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/useT";
import { AuthGate } from "@/components/AuthGate";

const TABS = [
  { href: "/upload", labelKey: "upload.tabSingle" as const },
  { href: "/upload/bulk", labelKey: "upload.tabBulk" as const },
  { href: "/upload/exhibition", labelKey: "upload.tabExhibition" as const },
] as const;

export default function UploadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { t } = useT();

  return (
    <AuthGate>
      <div className="mx-auto max-w-2xl px-4 py-6">
        <nav className="mb-6 flex gap-1 rounded-lg border border-zinc-200 bg-zinc-50/50 p-1">
          {TABS.map(({ href, labelKey }) => {
            const active =
              href === "/upload"
                ? pathname === "/upload"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                {t(labelKey)}
              </Link>
            );
          })}
        </nav>
        {children}
      </div>
    </AuthGate>
  );
}
