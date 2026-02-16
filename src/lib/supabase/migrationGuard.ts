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

  // (c) AI recs tables
  try {
    const { error: embErr } = await supabase
      .from("artwork_embeddings")
      .select("artwork_id")
      .limit(0);
    if (embErr) failed.push("ai_embeddings");
  } catch {
    failed.push("ai_embeddings");
  }
  try {
    const { error: tasteErr } = await supabase
      .from("user_taste_profiles")
      .select("user_id")
      .limit(0);
    if (tasteErr) failed.push("ai_taste_profiles");
  } catch {
    failed.push("ai_taste_profiles");
  }

  // (d) get_people_recs RPC exists
  try {
    const { error: rpcErr } = await supabase.rpc("get_people_recs", {
      p_mode: "follow_graph",
      p_roles: [],
      p_limit: 1,
      p_cursor: null,
    });
    if (rpcErr) failed.push("get_people_recs");
  } catch {
    failed.push("get_people_recs");
  }

  // (e) profiles.profile_details column + update_my_profile_details RPC (v5.1 merge)
  try {
    const { error: colErr } = await supabase
      .from("profiles")
      .select("profile_details")
      .limit(0);
    if (colErr) failed.push("profile_details_merge");
  } catch {
    failed.push("profile_details_merge");
  }
  try {
    const { error: rpcErr } = await supabase.rpc("update_my_profile_details", {
      p_details: {},
      p_completeness: 0,
    });
    if (rpcErr) failed.push("profile_details_merge");
  } catch {
    failed.push("profile_details_merge");
  }

  // (f) Delete RLS - attempt benign delete (non-existent row)
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
