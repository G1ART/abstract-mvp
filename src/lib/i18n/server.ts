import { cookies } from "next/headers";
import { LOCALE_COOKIE, normalizeLocale } from "./locale";
import { messages } from "./messages";

export async function getServerLocale(): Promise<"en" | "ko"> {
  const cookieStore = await cookies();
  const val = cookieStore.get(LOCALE_COOKIE)?.value;
  return normalizeLocale(val);
}

export function getT(locale: "en" | "ko") {
  return (key: string): string => {
    const m = messages[locale];
    const fallback = messages["en"];
    return (m as Record<string, string>)[key] ?? (fallback as Record<string, string>)[key] ?? key;
  };
}
