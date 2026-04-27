/**
 * Surface-friendly error message extraction.
 *
 * Supabase queries throw / return `PostgrestError`-shaped plain objects
 * (`{ message, details, hint, code }`) — they are NOT instances of
 * `Error`, so the common pattern
 *   `error instanceof Error ? error.message : String(error)`
 * collapses them to the literal string `[object Object]`, hiding the
 * real reason from the user. This helper unwraps those shapes so UI
 * messages stay actionable (e.g. "permission denied for table …",
 * "relation … does not exist", or RLS-policy violations).
 */

export function formatErrorMessage(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || error.name || "Error";

  if (typeof error === "object") {
    const o = error as Record<string, unknown>;
    const message = typeof o.message === "string" ? o.message.trim() : "";
    const details = typeof o.details === "string" ? o.details.trim() : "";
    const hint = typeof o.hint === "string" ? o.hint.trim() : "";
    const code = typeof o.code === "string" ? o.code.trim() : "";

    const parts: string[] = [];
    if (message) parts.push(message);
    if (details && details !== message) parts.push(details);
    if (hint && hint !== message && hint !== details) parts.push(`(${hint})`);
    if (code && parts.length === 0) parts.push(code);
    if (parts.length > 0) return parts.join(" — ");

    try {
      const json = JSON.stringify(error);
      if (json && json !== "{}") return json;
    } catch {
      // ignore circular structures
    }
  }

  return String(error);
}
