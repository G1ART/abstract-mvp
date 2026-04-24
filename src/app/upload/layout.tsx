"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/useT";
import { AuthGate } from "@/components/AuthGate";
import { TourTrigger, TourHelpButton } from "@/components/tour";
import { TOUR_IDS } from "@/lib/tours/tourRegistry";

const TABS = [
  { href: "/upload", labelKey: "upload.tabSingle" as const, anchor: "upload-tab-single" },
  { href: "/upload/bulk", labelKey: "upload.tabBulk" as const, anchor: "upload-tab-bulk" },
  { href: "/upload/exhibition", labelKey: "upload.tabExhibition" as const, anchor: "upload-tab-exhibition" },
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
      <TourTrigger tourId={TOUR_IDS.upload} />
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-2 flex items-center justify-end">
          <TourHelpButton tourId={TOUR_IDS.upload} />
        </div>
        <nav
          data-tour="upload-tabs"
          className="mb-6 flex flex-nowrap gap-1 overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50/50 p-1 [-webkit-overflow-scrolling:touch]"
        >
          {TABS.map(({ href, labelKey, anchor }) => {
            const active =
              href === "/upload"
                ? pathname === "/upload"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                data-tour={anchor}
                className={`shrink-0 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors ${
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
