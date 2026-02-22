"use client";

import { useEffect } from "react";
import { useT } from "@/lib/i18n/useT";

/**
 * Syncs <html lang> with the current locale (cookie) so that:
 * - Screen readers and crawlers see the correct language.
 * - Combined with body translate="no", avoids browser auto-translate mangling our i18n strings.
 */
export function HtmlLangSync() {
  const { locale } = useT();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const next = locale === "ko" ? "ko" : "en";
    if (root.getAttribute("lang") !== next) {
      root.setAttribute("lang", next);
    }
  }, [locale]);

  return null;
}
