"use client";

import { Suspense, useCallback, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/useT";
import { AuthGate } from "@/components/AuthGate";
import { sendArtistInviteEmailWithResult } from "@/lib/email/artistInvite";

/**
 * Invite-by-email entry surface, shipped as a salon-tone variant of
 * the People tab so the visual & copy register stays consistent across
 * "search → no result → invite".
 *
 * The Suspense fallback is text-less (skeleton only) so the KO locale
 * never sees an English literal flash before the form mounts.
 */
function PeopleInviteForm() {
  const searchParams = useSearchParams();
  const { t } = useT();
  const nameFromQuery = searchParams.get("name") ?? "";

  const [artistName, setArtistName] = useState(nameFromQuery.trim());
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<"success" | "error" | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmedEmail = email.trim();
      if (!trimmedEmail) return;
      setSending(true);
      setToast(null);
      const result = await sendArtistInviteEmailWithResult({
        toEmail: trimmedEmail,
        artistName: artistName.trim() || null,
        exhibitionTitle: null,
      });
      setSending(false);
      if (result.ok) {
        setToast("success");
        setEmail("");
      } else {
        setToast("error");
      }
    },
    [artistName, email]
  );

  return (
    <AuthGate>
      <main className="mx-auto max-w-md px-6 py-10 lg:py-14">
        <header className="mb-8">
          <p className="flex items-center gap-2.5 text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-700">
            <span aria-hidden className="h-3 w-[2px] bg-zinc-900" />
            {t("people.kicker")}
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900">
            {t("people.invitePage.title")}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            {t("people.invitePage.hint")}
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="artistName"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              {t("people.invitePage.artistName")}
            </label>
            <input
              id="artistName"
              type="text"
              value={artistName}
              onChange={(e) => setArtistName(e.target.value)}
              placeholder={t("people.invitePage.artistNamePlaceholder")}
              className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-[15px] text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-200"
            />
          </div>
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              {t("people.invitePage.email")} <span className="text-red-500">*</span>
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("people.invitePage.emailPlaceholder")}
              className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-[15px] text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-200"
            />
          </div>
          {toast && (
            <p
              className={`text-sm ${toast === "success" ? "text-zinc-600" : "text-amber-600"}`}
              role="status"
            >
              {toast === "success"
                ? t("people.invitePage.success")
                : t("people.invitePage.failed")}
            </p>
          )}
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="submit"
              disabled={sending || !email.trim()}
              className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {sending ? t("common.loading") : t("people.invitePage.send")}
            </button>
            <Link
              href="/people"
              className="rounded-full border border-zinc-300 bg-white px-5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {t("people.invitePage.backToSearch")}
            </Link>
          </div>
        </form>
      </main>
    </AuthGate>
  );
}

function PeopleInviteSkeleton() {
  return (
    <main aria-hidden="true" className="mx-auto max-w-md px-6 py-10 lg:py-14">
      <div className="mb-8 space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="h-3 w-[2px] bg-zinc-300" />
          <span className="h-2 w-16 rounded bg-zinc-200" />
        </div>
        <div className="h-7 w-48 rounded bg-zinc-200" />
        <div className="h-3 w-3/4 rounded bg-zinc-100" />
      </div>
      <div className="space-y-5">
        <div className="h-12 w-full rounded-xl bg-zinc-100" />
        <div className="h-12 w-full rounded-xl bg-zinc-100" />
        <div className="h-9 w-32 rounded-full bg-zinc-200" />
      </div>
    </main>
  );
}

export default function PeopleInvitePage() {
  return (
    <Suspense fallback={<PeopleInviteSkeleton />}>
      <PeopleInviteForm />
    </Suspense>
  );
}
