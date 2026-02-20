/**
 * Exhibition (project) and exhibition_works API.
 * Design: docs/EXHIBITION_PROJECT_AND_MULTI_CLAIM_DESIGN.md
 */

import { supabase } from "./client";

export type ExhibitionRow = {
  id: string;
  project_type: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  curator_id: string;
  host_name: string | null;
  host_profile_id: string | null;
  created_at: string | null;
};

export type ExhibitionWorkRow = {
  id: string;
  exhibition_id: string;
  work_id: string;
  added_by_profile_id: string | null;
  sort_order: number | null;
  created_at: string;
};

/** List exhibitions I curate or host (for My profile "기획한 전시" / "진행 중인 전시"). */
export async function listMyExhibitions(): Promise<{
  data: ExhibitionRow[];
  error: unknown;
}> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { data: [], error: null };

  const { data, error } = await supabase
    .from("projects")
    .select("id, project_type, title, start_date, end_date, status, curator_id, host_name, host_profile_id, created_at")
    .eq("project_type", "exhibition")
    .or(`curator_id.eq.${session.user.id},host_profile_id.eq.${session.user.id}`)
    .order("created_at", { ascending: false });

  if (error) return { data: [], error };
  return { data: (data ?? []) as ExhibitionRow[], error: null };
}

/** Create an exhibition (project). Caller becomes curator_id. */
export async function createExhibition(args: {
  title: string;
  start_date?: string | null;
  end_date?: string | null;
  status?: string;
  host_name?: string | null;
  host_profile_id?: string | null;
}): Promise<{ data: { id: string } | null; error: unknown }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { data: null, error: new Error("Not authenticated") };

  const { data, error } = await supabase
    .from("projects")
    .insert({
      project_type: "exhibition",
      title: args.title.trim(),
      start_date: args.start_date ?? null,
      end_date: args.end_date ?? null,
      status: args.status ?? "planned",
      curator_id: session.user.id,
      host_name: args.host_name?.trim() || null,
      host_profile_id: args.host_profile_id ?? null,
    })
    .select("id")
    .single();

  if (error) return { data: null, error };
  return { data: data as { id: string }, error: null };
}

/** Update exhibition (title, dates, status, host). */
export async function updateExhibition(
  id: string,
  patch: Partial<Pick<ExhibitionRow, "title" | "start_date" | "end_date" | "status" | "host_name" | "host_profile_id">>
): Promise<{ error: unknown }> {
  const payload: Record<string, unknown> = {};
  if (patch.title !== undefined) payload.title = patch.title.trim();
  if (patch.start_date !== undefined) payload.start_date = patch.start_date;
  if (patch.end_date !== undefined) payload.end_date = patch.end_date;
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.host_name !== undefined) payload.host_name = patch.host_name?.trim() || null;
  if (patch.host_profile_id !== undefined) payload.host_profile_id = patch.host_profile_id;

  const { error } = await supabase.from("projects").update(payload).eq("id", id);
  return { error };
}

/** List works in an exhibition (exhibition_works + artwork ids; full artwork details can be fetched separately). */
export async function listWorksInExhibition(exhibitionId: string): Promise<{
  data: ExhibitionWorkRow[];
  error: unknown;
}> {
  const { data, error } = await supabase
    .from("exhibition_works")
    .select("id, exhibition_id, work_id, added_by_profile_id, sort_order, created_at")
    .eq("exhibition_id", exhibitionId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) return { data: [], error };
  return { data: (data ?? []) as ExhibitionWorkRow[], error: null };
}

/** Add a work to an exhibition (D6: claim is separate; optionally create pending claim via provenance RPC). */
export async function addWorkToExhibition(
  exhibitionId: string,
  workId: string
): Promise<{ data: { id: string } | null; error: unknown }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return { data: null, error: new Error("Not authenticated") };

  const { data, error } = await supabase
    .from("exhibition_works")
    .insert({
      exhibition_id: exhibitionId,
      work_id: workId,
      added_by_profile_id: session.user.id,
    })
    .select("id")
    .single();

  if (error) return { data: null, error };
  return { data: data as { id: string }, error: null };
}

/** Remove a work from an exhibition (exhibition_works only; D6: do not touch claims). */
export async function removeWorkFromExhibition(
  exhibitionId: string,
  workId: string
): Promise<{ error: unknown }> {
  const { error } = await supabase
    .from("exhibition_works")
    .delete()
    .eq("exhibition_id", exhibitionId)
    .eq("work_id", workId);

  return { error };
}

/** List exhibitions for a profile: curated/hosted by them OR they have works in. For My & public profile tabs. */
export async function listExhibitionsForProfile(profileId: string): Promise<{
  data: ExhibitionRow[];
  error: unknown;
}> {
  const [curatedRes, worksRes] = await Promise.all([
    supabase
      .from("projects")
      .select("id, project_type, title, start_date, end_date, status, curator_id, host_name, host_profile_id, created_at")
      .eq("project_type", "exhibition")
      .or(`curator_id.eq.${profileId},host_profile_id.eq.${profileId}`)
      .order("created_at", { ascending: false }),
    supabase.from("artworks").select("id").eq("artist_id", profileId),
  ]);
  const curated = (curatedRes.data ?? []) as ExhibitionRow[];
  const myWorkIds = (worksRes.data ?? []).map((r: { id: string }) => r.id);
  if (myWorkIds.length === 0) return { data: curated, error: curatedRes.error };
  const { data: ewRows } = await supabase
    .from("exhibition_works")
    .select("exhibition_id")
    .in("work_id", myWorkIds);
  const participantIds = [...new Set((ewRows ?? []).map((r: { exhibition_id: string }) => r.exhibition_id))];
  if (participantIds.length === 0) return { data: curated, error: curatedRes.error };
  const curatedIds = new Set(curated.map((e) => e.id));
  const needFetch = participantIds.filter((id) => !curatedIds.has(id));
  if (needFetch.length === 0) return { data: curated, error: curatedRes.error };
  const { data: participantProjects } = await supabase
    .from("projects")
    .select("id, project_type, title, start_date, end_date, status, curator_id, host_name, host_profile_id, created_at")
    .in("id", needFetch)
    .eq("project_type", "exhibition");
  const participant = (participantProjects ?? []) as ExhibitionRow[];
  const merged = [...curated];
  for (const p of participant) {
    if (!curatedIds.has(p.id)) {
      curatedIds.add(p.id);
      merged.push(p);
    }
  }
  merged.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
  return { data: merged, error: null };
}

/** Get one exhibition by id (for detail/edit). */
export async function getExhibitionById(id: string): Promise<{
  data: ExhibitionRow | null;
  error: unknown;
}> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, project_type, title, start_date, end_date, status, curator_id, host_name, host_profile_id, created_at")
    .eq("id", id)
    .eq("project_type", "exhibition")
    .maybeSingle();

  if (error) return { data: null, error };
  return { data: data as ExhibitionRow | null, error: null };
}
