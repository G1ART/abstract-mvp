"use client";

import Link from "next/link";
import { AuthGate } from "@/components/AuthGate";
import { useT } from "@/lib/i18n/useT";
import { PageShell } from "@/components/ds/PageShell";
import { PageHeader } from "@/components/ds/PageHeader";
import { CvEditorClient } from "./CvEditorClient";

/**
 * /my/profile/cv — Profile Materials CV editor (P6.1).
 *
 * Dedicated editing surface for the four CV jsonb columns
 * (education / exhibitions / awards / residencies). Reached from the
 * Profile Materials panel on /my; the public-profile CV modal (P5)
 * reads the same columns.
 *
 * The page itself is a thin shell (auth gate + page chrome). All state
 * + RPC plumbing lives in `CvEditorClient` so the page stays readable
 * and the client component can be unit-tested in isolation later.
 *
 * Persona — visible to anyone (the editor is intentionally available
 * even to non-artist personas: a curator may want to record their own
 * CV at some point). The /my Profile Materials panel only surfaces the
 * card for artists for now, so the typical entrypoint stays
 * artist-scoped.
 */
export default function CvEditorPage() {
  const { t } = useT();
  return (
    <AuthGate>
      <PageShell variant="narrow">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Link
            href="/my"
            className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-medium text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
          >
            <span aria-hidden="true">←</span>
            {t("cv.editor.backToStudio")}
          </Link>
        </div>
        <PageHeader
          variant="plain"
          title={t("cv.editor.title")}
          lead={t("cv.editor.lead")}
        />
        <CvEditorClient />
      </PageShell>
    </AuthGate>
  );
}
