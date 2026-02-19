/**
 * Supabase/PostgREST often return error as a plain object { message, code, details }, not Error.
 * Use this to show the real server message in the UI and to log for debugging.
 */
export function formatSupabaseError(error: unknown, fallback: string): string {
  if (error == null) return fallback;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  if (typeof error === "string") return error;
  return fallback;
}

/** Log the raw error so it appears in the browser console when the UI shows a generic message. */
export function logSupabaseError(context: string, error: unknown): void {
  console.error(`[Supabase] ${context}`, error);
}
