/**
 * Lightweight checks for required Supabase migrations.
 * Run on app boot or /settings entry. Dev: toast + console; Prod: console only.
 */

import { supabase } from "./client";

export type MigrationCheckResult = {
  ok: boolean;
  failed: string[];
};

export async function checkSupabaseMigrations(): Promise<MigrationCheckResult> {
  const failed: string[] = [];

  // (a) artworks.visibility supports 'draft' - query that would fail if enum/column missing
  try {
    const { error } = await supabase
      .from("artworks")
      .select("id")
      .eq("visibility", "draft")
      .limit(0);
    if (error) failed.push("artworks_visibility_draft");
  } catch {
    failed.push("artworks_visibility_draft");
  }

  // (b) artist_sort_order column exists
  try {
    const { error } = await supabase
      .from("artworks")
      .select("artist_sort_order")
      .limit(0);
    if (error) failed.push("artworks_artist_sort_order");
  } catch {
    failed.push("artworks_artist_sort_order");
  }

  // (c) Delete RLS - attempt benign delete (non-existent row)
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user?.id) {
      const { error } = await supabase
        .from("artworks")
        .delete()
        .eq("id", "00000000-0000-0000-0000-000000000000")
        .eq("artist_id", session.user.id);
      if (error?.message?.toLowerCase().includes("policy") || error?.message?.toLowerCase().includes("permission")) {
        failed.push("artwork_delete_rls");
      }
    }
  } catch {
    failed.push("artwork_delete_rls");
  }

  return { ok: failed.length === 0, failed };
}
