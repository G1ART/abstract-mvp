"use client";

/**
 * Profile materials panel — surfaces Artist Statement and CV editing
 * inside the studio (`/my`). The two surfaces back the public-profile
 * `ProfileSurfaceCards` modals; this is where artists actually fill
 * them in.
 *
 * Statement editing already lives in /settings#statement (with full
 * AI draft assist + hero uploader); this panel just navigates there.
 * CV editing is brand new — its dedicated editor is /my/profile/cv.
 *
 * Visibility: artist persona only (incl. hybrid). For curator /
 * collector / gallerist the parent suppresses the panel entirely so
 * non-artist studios stay calm.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { useT } from "@/lib/i18n/useT";
import { FloorPanel } from "@/components/ds/FloorPanel";

type Props = {
  hasStatement: boolean;
  statementCharCount: number;
  cvEntryCount: number;
};

export function StudioMaterialsPanel({
  hasStatement,
  statementCharCount,
  cvEntryCount,
}: Props) {
  const { t } = useT();

  const hasCv = cvEntryCount > 0;

  return (
    <section data-tour="studio-materials" className="mb-6">
      <div className="mb-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
          {t("studio.materials.title")}
        </h2>
        <p className="mt-1 text-sm text-zinc-600">{t("studio.materials.intro")}</p>
      </div>
      <FloorPanel padding="sm">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <MaterialCard
            label={t("studio.materials.statementTitle")}
            hint={
              hasStatement
                ? t("studio.materials.statementHintFilled").replace(
                    "{count}",
                    String(statementCharCount),
                  )
                : t("studio.materials.statementHintEmpty")
            }
            cta={
              hasStatement
                ? t("studio.materials.editStatement")
                : t("studio.materials.startStatement")
            }
            href="/settings#statement"
            empty={!hasStatement}
            icon={<StatementIcon />}
          />
          <MaterialCard
            label={t("studio.materials.cvTitle")}
            hint={
              hasCv
                ? t("studio.materials.cvHintFilled").replace("{count}", String(cvEntryCount))
                : t("studio.materials.cvHintEmpty")
            }
            cta={hasCv ? t("studio.materials.editCv") : t("studio.materials.startCv")}
            href="/my/profile/cv"
            empty={!hasCv}
            icon={<CvIcon />}
          />
        </div>
      </FloorPanel>
    </section>
  );
}

type MaterialCardProps = {
  label: string;
  hint: string;
  cta: string;
  href: string;
  empty: boolean;
  icon: ReactNode;
};

function MaterialCard({ label, hint, cta, href, empty, icon }: MaterialCardProps) {
  return (
    <Link
      href={href}
      className={`group flex items-start gap-3 rounded-2xl border bg-white p-4 transition hover:border-zinc-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 ${
        empty ? "border-dashed border-zinc-300" : "border-zinc-200"
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          empty ? "bg-zinc-50 text-zinc-500" : "bg-zinc-900 text-white"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-zinc-900">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">{hint}</span>
        <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-zinc-700 transition group-hover:text-zinc-900">
          {cta}
          <ChevronRightIcon />
        </span>
      </span>
    </Link>
  );
}

function StatementIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7h12" />
      <path d="M3 12h12" />
      <path d="M3 17h8" />
      <path d="M19 5v14" />
    </svg>
  );
}

function CvIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 10h8" />
      <path d="M8 14h5" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="transition group-hover:translate-x-0.5"
    >
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}
