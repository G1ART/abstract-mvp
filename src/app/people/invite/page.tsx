"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/useT";
import { AuthGate } from "@/components/AuthGate";
import { sendArtistInviteEmailWithResult } from "@/lib/email/artistInvite";

export default function PeopleInvitePage() {
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
      <main className="mx-auto max-w-md px-4 py-8">
        <h1 className="mb-2 text-xl font-semibold">{t("people.invitePage.title")}</h1>
        <p className="mb-6 text-sm text-zinc-600">{t("people.invitePage.hint")}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="artistName" className="mb-1 block text-sm font-medium text-zinc-700">
              {t("people.invitePage.artistName")}
            </label>
            <input
              id="artistName"
              type="text"
              value={artistName}
              onChange={(e) => setArtistName(e.target.value)}
              placeholder={t("people.invitePage.artistNamePlaceholder")}
              className="w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900"
            />
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-zinc-700">
              {t("people.invitePage.email")} <span className="text-red-500">*</span>
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("people.invitePage.emailPlaceholder")}
              className="w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900"
            />
          </div>
          {toast && (
            <p
              className={`text-sm ${toast === "success" ? "text-zinc-600" : "text-amber-600"}`}
              role="status"
            >
              {toast === "success" ? t("people.invitePage.success") : t("people.invitePage.failed")}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={sending || !email.trim()}
              className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {sending ? t("common.loading") : t("people.invitePage.send")}
            </button>
            <Link
              href="/people"
              className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {t("people.invitePage.backToSearch")}
            </Link>
          </div>
        </form>
      </main>
    </AuthGate>
  );
}
