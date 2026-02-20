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

export type ExhibitionMediaRow = {
  id: string;
  exhibition_id: string;
  type: "installation" | "side_event" | "custom";
  bucket_title: string | null;
  storage_path: string;
  sort_order: number | null;
  created_at: string;
};

export type ExhibitionMediaBucketRow = {
  id: string;
  exhibition_id: string;
  key: string;
  title: string;
  type: "installation" | "side_event" | "custom";
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

/** List exhibitions for feed: curated or hosted by any of the given profile IDs (e.g. people I follow). */
export async function listExhibitionsForFeed(profileIds: string[]): Promise<{
  data: ExhibitionRow[];
  error: unknown;
}> {
  if (profileIds.length === 0) return { data: [], error: null };
  const ids = profileIds.slice(0, 50);
  const [curatedRes, hostRes] = await Promise.all([
    supabase
      .from("projects")
      .select("id, project_type, title, start_date, end_date, status, curator_id, host_name, host_profile_id, created_at")
      .eq("project_type", "exhibition")
      .in("curator_id", ids)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("projects")
      .select("id, project_type, title, start_date, end_date, status, curator_id, host_name, host_profile_id, created_at")
      .eq("project_type", "exhibition")
      .in("host_profile_id", ids)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const byId = new Map<string, ExhibitionRow>();
  for (const row of (curatedRes.data ?? []) as ExhibitionRow[]) {
    byId.set(row.id, row);
  }
  for (const row of (hostRes.data ?? []) as ExhibitionRow[]) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  const merged = Array.from(byId.values()).sort(
    (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
  );
  return { data: merged.slice(0, 30), error: curatedRes.error ?? hostRes.error };
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

/** List exhibition-level media (전시전경, 부대행사, or custom buckets via bucket_title). */
export async function listExhibitionMedia(exhibitionId: string): Promise<{
  data: ExhibitionMediaRow[];
  error: unknown;
}> {
  const { data, error } = await supabase
    .from("exhibition_media")
    .select("id, exhibition_id, type, bucket_title, storage_path, sort_order, created_at")
    .eq("exhibition_id", exhibitionId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) return { data: [], error };
  return { data: (data ?? []) as ExhibitionMediaRow[], error: null };
}

export type ExhibitionMediaBucket = {
  key: string;
  title: string;
  items: ExhibitionMediaRow[];
  /** For inserting new photo into this bucket. */
  insertType: "installation" | "side_event" | "custom";
  insertBucketTitle: string | null;
};

/** Group media by display bucket: key = bucket_title ?? type (for section title). */
export function groupExhibitionMediaByBucket(
  media: ExhibitionMediaRow[],
  t: (key: string) => string,
  bucketRows?: ExhibitionMediaBucketRow[]
): ExhibitionMediaBucket[] {
  const byKey = new Map<string, ExhibitionMediaRow[]>();
  const defaultTitles: Record<string, string> = {
    installation: "exhibition.installationViews",
    side_event: "exhibition.sideEvents",
  };
  for (const m of media) {
    const key = m.bucket_title?.trim() || m.type;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(m);
  }
  const buckets = Array.from(byKey.entries()).map(([key, items]) => {
    const first = items[0];
    const insertType: "installation" | "side_event" | "custom" =
      key === "installation" ? "installation" : key === "side_event" ? "side_event" : "custom";
    return {
      key,
      title: defaultTitles[key] ? t(defaultTitles[key]) : key,
      items,
      insertType,
      insertBucketTitle: insertType === "custom" ? (first?.bucket_title?.trim() || key) : null,
    };
  });
  // Ensure installation and side_event exist (for "add photo" UI even when empty)
  for (const k of ["installation", "side_event"]) {
    if (!byKey.has(k)) {
      buckets.push({
        key: k,
        title: defaultTitles[k] ? t(defaultTitles[k]) : k,
        items: [],
        insertType: k as "installation" | "side_event",
        insertBucketTitle: null,
      });
    }
  }
  if (bucketRows?.length) {
    const byMeta = new Map(bucketRows.map((r) => [r.key, r]));
    for (const b of buckets) {
      const meta = byMeta.get(b.key);
      if (meta?.title?.trim()) b.title = meta.title.trim();
    }
    buckets.sort((a, b) => {
      const ma = byMeta.get(a.key);
      const mb = byMeta.get(b.key);
      const ao = ma?.sort_order ?? Number.MAX_SAFE_INTEGER;
      const bo = mb?.sort_order ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      if (ma && !mb) return -1;
      if (!ma && mb) return 1;
      return 0;
    });
  }
  return buckets;
}

/** Insert one exhibition media row (curator/host only via RLS). Use type 'custom' + bucket_title for user-named buckets. */
export async function insertExhibitionMedia(args: {
  exhibition_id: string;
  type: "installation" | "side_event" | "custom";
  bucket_title?: string | null;
  storage_path: string;
  sort_order?: number | null;
}): Promise<{ data: { id: string } | null; error: unknown }> {
  const { data, error } = await supabase
    .from("exhibition_media")
    .insert({
      exhibition_id: args.exhibition_id,
      type: args.type,
      bucket_title: args.bucket_title?.trim() || null,
      storage_path: args.storage_path,
      sort_order: args.sort_order ?? 0,
    })
    .select("id")
    .single();
  if (error) return { data: null, error };
  return { data: data as { id: string }, error: null };
}

/** Delete exhibition media (curator/host only via RLS). */
export async function deleteExhibitionMedia(id: string): Promise<{ error: unknown }> {
  const { error } = await supabase.from("exhibition_media").delete().eq("id", id);
  return { error };
}

/** Ensure fixed default buckets exist for this exhibition. */
export async function ensureDefaultExhibitionMediaBuckets(exhibitionId: string): Promise<{ error: unknown }> {
  const rows = [
    { exhibition_id: exhibitionId, key: "installation", title: "installation", type: "installation", sort_order: 0 },
    { exhibition_id: exhibitionId, key: "side_event", title: "side_event", type: "side_event", sort_order: 1 },
  ];
  const { error } = await supabase
    .from("exhibition_media_buckets")
    .upsert(rows, { onConflict: "exhibition_id,key", ignoreDuplicates: false });
  return { error };
}

export async function listExhibitionMediaBuckets(exhibitionId: string): Promise<{
  data: ExhibitionMediaBucketRow[];
  error: unknown;
}> {
  const { data, error } = await supabase
    .from("exhibition_media_buckets")
    .select("id, exhibition_id, key, title, type, sort_order, created_at")
    .eq("exhibition_id", exhibitionId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) return { data: [], error };
  return { data: (data ?? []) as ExhibitionMediaBucketRow[], error: null };
}

export async function upsertExhibitionMediaBucket(args: {
  exhibition_id: string;
  key: string;
  title: string;
  type: "installation" | "side_event" | "custom";
  sort_order?: number | null;
}): Promise<{ error: unknown }> {
  const { error } = await supabase.from("exhibition_media_buckets").upsert(
    {
      exhibition_id: args.exhibition_id,
      key: args.key,
      title: args.title.trim(),
      type: args.type,
      sort_order: args.sort_order ?? 0,
    },
    { onConflict: "exhibition_id,key" }
  );
  return { error };
}

export async function updateExhibitionMediaBucketOrder(
  exhibitionId: string,
  orderedBucketKeys: string[]
): Promise<{ error: unknown }> {
  if (orderedBucketKeys.length === 0) return { error: null };
  const results = await Promise.all(
    orderedBucketKeys.map((key, idx) =>
      supabase
        .from("exhibition_media_buckets")
        .update({ sort_order: idx })
        .eq("exhibition_id", exhibitionId)
        .eq("key", key)
    )
  );
  const failed = results.find((r) => r.error);
  return { error: failed?.error ?? null };
}

/** Persist complete works order for an exhibition (global order across artist buckets). */
export async function updateExhibitionWorksOrder(
  exhibitionId: string,
  orderedWorkIds: string[]
): Promise<{ error: unknown }> {
  if (orderedWorkIds.length === 0) return { error: null };
  const results = await Promise.all(
    orderedWorkIds.map((workId, idx) =>
      supabase
        .from("exhibition_works")
        .update({ sort_order: idx })
        .eq("exhibition_id", exhibitionId)
        .eq("work_id", workId)
    )
  );
  const failed = results.find((r) => r.error);
  return { error: failed?.error ?? null };
}

/** Persist complete media order for an exhibition (global order across media buckets). */
export async function updateExhibitionMediaOrder(
  exhibitionId: string,
  orderedMediaIds: string[]
): Promise<{ error: unknown }> {
  if (orderedMediaIds.length === 0) return { error: null };
  const results = await Promise.all(
    orderedMediaIds.map((mediaId, idx) =>
      supabase
        .from("exhibition_media")
        .update({ sort_order: idx })
        .eq("exhibition_id", exhibitionId)
        .eq("id", mediaId)
    )
  );
  const failed = results.find((r) => r.error);
  return { error: failed?.error ?? null };
}

/** List exhibitions that include this work (for artwork detail "Part of exhibitions"). */
export async function listExhibitionsForWork(workId: string): Promise<{
  data: ExhibitionRow[];
  error: unknown;
}> {
  const { data: ewRows, error: ewError } = await supabase
    .from("exhibition_works")
    .select("exhibition_id")
    .eq("work_id", workId);
  if (ewError || !ewRows?.length) return { data: [], error: ewError ?? null };
  const ids = [...new Set(ewRows.map((r: { exhibition_id: string }) => r.exhibition_id))];
  const { data, error } = await supabase
    .from("projects")
    .select("id, project_type, title, start_date, end_date, status, curator_id, host_name, host_profile_id, created_at")
    .in("id", ids)
    .eq("project_type", "exhibition")
    .order("created_at", { ascending: false });
  if (error) return { data: [], error };
  return { data: (data ?? []) as ExhibitionRow[], error: null };
}
