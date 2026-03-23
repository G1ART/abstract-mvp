"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/useT";
import {
  RANDOM_USERNAME_PROMPTED_KEY,
} from "@/lib/profile/randomUsername";

function safeNext(next: string | null): string {
  if (!next || typeof next !== "string") return "/feed?tab=all&sort=latest";
  const trimmed = next.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/feed?tab=all&sort=latest";
  return trimmed;
}

function UsernameFixInner() {
  const { t } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNext(searchParams.get("next"));

  function goSettings() {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(RANDOM_USERNAME_PROMPTED_KEY);
      window.sessionStorage.setItem("ab_focus_username_field", "1");
      window.sessionStorage.setItem("ab_username_fix_next_path", nextPath);
    }
    router.push("/settings");
  }

  function skipForNow() {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(RANDOM_USERNAME_PROMPTED_KEY);
    }
    router.replace(nextPath);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-10">
      <div className="w-full rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h1 className="text-lg font-semibold text-zinc-900">
          {t("usernameFix.title")}
        </h1>
        <p className="mt-2 text-sm text-zinc-700">
          {t("usernameFix.description")}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={goSettings}
            className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            {t("usernameFix.editNow")}
          </button>
          <button
            type="button"
            onClick={skipForNow}
            className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {t("usernameFix.later")}
          </button>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          <Link href={nextPath} className="underline hover:text-zinc-700">
            {t("usernameFix.continueCurrent")}
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function UsernameFixPage() {
  const { t } = useT();
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-10">
          <div className="w-full rounded-xl border border-amber-200 bg-amber-50 p-5">
            <h1 className="text-lg font-semibold text-zinc-900">{t("usernameFix.title")}</h1>
            <p className="mt-2 text-sm text-zinc-700">{t("common.loading")}</p>
          </div>
        </main>
      }
    >
      <UsernameFixInner />
    </Suspense>
  );
}
