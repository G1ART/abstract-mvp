export type Locale = "en" | "ko";

export const LOCALE_COOKIE = "ab_locale";

export function normalizeLocale(v: string | null | undefined): Locale {
  const s = (v ?? "").trim().toLowerCase();
  return s.startsWith("ko") ? "ko" : "en";
}

export function defaultLocaleFromRequest(reqHeaders: Headers): Locale {
  // 1) Vercel geo header
  const country = reqHeaders.get("x-vercel-ip-country");
  if (country === "KR") return "ko";

  // 2) Accept-Language
  const acceptLang = reqHeaders.get("accept-language") ?? "";
  if (acceptLang.toLowerCase().includes("ko")) return "ko";

  return "en";
}

/** Client only: read locale from document.cookie */
export function getCookieLocale(): Locale | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${encodeURIComponent(LOCALE_COOKIE)}=([^;]*)`)
  );
  const val = match ? decodeURIComponent(match[1]) : null;
  return val ? normalizeLocale(val) : null;
}

/** Client only: set locale cookie */
export function setCookieLocale(locale: Locale): void {
  if (typeof document === "undefined") return;
  document.cookie = `${encodeURIComponent(LOCALE_COOKIE)}=${encodeURIComponent(locale)}; path=/; max-age=31536000; samesite=lax`;
}
