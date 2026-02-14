"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { type Locale, getCookieLocale, setCookieLocale } from "./locale";
import { messages } from "./messages";

export function useT() {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(() => getCookieLocale() ?? "en");

  useEffect(() => {
    const c = getCookieLocale();
    if (c) setLocaleState(c);
  }, []);

  const t = useCallback(
    (key: string): string => {
      const loc = getCookieLocale() ?? locale;
      const m = messages[loc];
      const fallback = messages["en"];
      return (m as Record<string, string>)[key] ?? (fallback as Record<string, string>)[key] ?? key;
    },
    [locale]
  );

  const setLocale = useCallback(
    (newLocale: Locale) => {
      setCookieLocale(newLocale);
      setLocaleState(newLocale);
      router.refresh();
    },
    [router]
  );

  return { locale: getCookieLocale() ?? locale, setLocale, t };
}
