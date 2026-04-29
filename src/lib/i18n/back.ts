import type { Locale } from "./locale";

/**
 * Locale-aware "back to X" label builder. The leading arrow (←)
 * lives in the markup, not here.
 *
 * EN: `Back to {label}`     — natural English phrasing.
 * KO: `{label}`             — Korean reads more naturally without
 *                              "돌아가기" before the noun (the arrow
 *                              already carries that meaning), and
 *                              avoids the 으로/로 particle pitfall.
 *                              QA report 2026-04-29 flagged
 *                              "← 돌아가기 개별 업로드" as awkward
 *                              and asked for "← 개별 업로드" /
 *                              "← 개별 업로드로 돌아가기" — we go
 *                              with the former for brevity and
 *                              uniform layout across all back-links.
 */
export function backToLabel(label: string, locale: Locale): string {
  const trimmed = (label ?? "").trim();
  if (!trimmed) return "";
  if (locale === "ko") return trimmed;
  return `Back to ${trimmed}`;
}
