-- ===========================================================================
-- Hotfix v3: get_artwork_passport_for_viewer
--   * fix enum/text comparison crash (artwork_visibility: empty-string)
--   * fix made-up claims columns (c.role / c.is_primary / c.profile_id /
--     c.artwork_id / c.sort_order do NOT exist; the real columns are
--     c.claim_type / c.subject_profile_id / c.artist_profile_id /
--     c.external_artist_id / c.work_id / c.status / c.period_status /
--     c.start_date / c.end_date / c.created_at).
--   * keep Phase 0 redaction guarantees (no to_jsonb, no invite_email
--     in the viewer payload).
-- ===========================================================================
--
-- NOTE FOR THE OPERATOR
--   Paste this ENTIRE file into the Supabase SQL Editor and press Run.
--   The header comments below intentionally avoid single quotes because
--   the dashboard SQL splitter tokenizes paste-input client-side and a
--   stray apostrophe in a line comment can confuse its quote tracker
--   (per .cursor/rules/release-workflow.mdc paragraph 1-1). If you see
--   ERROR 42P01 relation v_aw does not exist on a function paste, that
--   is the same class of bug.
--
-- WHAT THIS FIXES (chronological)
--   1. Symptom: every viewer (logged in or not, follower or stranger)
--      who clicked an artwork from the feed saw
--        invalid input value for enum artwork_visibility:
--      Cause: coalesce(v_aw.visibility, empty-text) tried to cast the
--      empty-text fallback TO the artwork_visibility enum and failed
--      with 22P02 before any redaction logic could run.
--   2. Symptom: after fixing 1, every viewer saw
--        column c.role does not exist
--      Cause: Sprint 6 SECTION 1 rewrote the claims subquery against an
--      imagined claims schema with c.role / c.is_primary / c.profile_id
--      / c.artwork_id / c.sort_order. None of those columns exist. The
--      real schema (p0_claims.sql + p0_claims_period_and_price_inquiry_
--      delegates.sql) uses c.claim_type / c.subject_profile_id /
--      c.artist_profile_id / c.external_artist_id / c.work_id /
--      c.status / c.period_status / c.start_date / c.end_date /
--      c.created_at. The client ArtworkClaim type in
--      src/lib/supabase/artworks.ts also expects those keys.
--
-- HOW THIS FIXES IT
--   * Cast the enum to text before coalescing in the visibility gate.
--   * Restore the Sprint 5.2 claims projection (real columns) but keep
--     the Phase 0 hardening: external_artists is reduced to display_name
--     only (no invite_email leak), profiles is reduced to the public
--     subset the UI already shows.
--   * No to_jsonb on whole rows anywhere in this RPC.

create or replace function public.get_artwork_passport_for_viewer(
  p_artwork_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $hotfix$
declare
  v_uid uuid := auth.uid();
  v_aw record;
  v_owner uuid;
  v_vis_text text;
  v_price jsonb;
  v_avail jsonb;
  v_desc jsonb;
  v_relationship jsonb;
  v_can_price boolean;
  v_can_avail boolean;
  v_can_desc boolean;
  v_artwork jsonb;
begin
  if p_artwork_id is null then
    return null;
  end if;

  select
    a.id, a.title, a.year, a.medium, a.size, a.size_unit, a.story,
    a.visibility, a.created_by, a.pricing_mode, a.is_price_public,
    a.price_usd, a.price_input_amount, a.price_input_currency,
    a.fx_rate_to_usd, a.fx_date, a.ownership_status, a.artist_id,
    a.artist_sort_order, a.created_at, a.provenance_visible
  into v_aw
  from public.artworks a
  where a.id = p_artwork_id;

  if v_aw.id is null then
    return null;
  end if;

  v_owner    := v_aw.artist_id;
  v_vis_text := coalesce(v_aw.visibility::text, '');

  if v_vis_text <> 'public' then
    if v_uid is null
       or (v_uid <> v_owner
           and not public.is_active_account_delegate_writer(v_owner)) then
      return null;
    end if;
  end if;

  v_price        := public.resolve_visibility_for_viewer(v_owner, 'artwork', v_aw.id, 'price');
  v_avail        := public.resolve_visibility_for_viewer(v_owner, 'artwork', v_aw.id, 'availability');
  v_desc         := public.resolve_visibility_for_viewer(v_owner, 'artwork', v_aw.id, 'description');
  v_relationship := public.get_viewer_relationship_context(v_owner);

  v_can_price := coalesce((v_price->>'can_view')::boolean, false);
  v_can_avail := coalesce((v_avail->>'can_view')::boolean, false);
  v_can_desc  := coalesce((v_desc ->>'can_view')::boolean, false);

  v_artwork := jsonb_build_object(
    'id', v_aw.id,
    'title', v_aw.title,
    'year', v_aw.year,
    'medium', v_aw.medium,
    'size', v_aw.size,
    'size_unit', v_aw.size_unit,
    'visibility', v_aw.visibility,
    'created_by', v_aw.created_by,
    'artist_id', v_aw.artist_id,
    'artist_sort_order', v_aw.artist_sort_order,
    'created_at', v_aw.created_at,
    'provenance_visible', v_aw.provenance_visible,
    'ownership_status',     case when v_can_avail then v_aw.ownership_status     else null end,
    'pricing_mode',         case when v_can_price then v_aw.pricing_mode         else null end,
    'is_price_public',      case when v_can_price then v_aw.is_price_public      else null end,
    'price_usd',            case when v_can_price then v_aw.price_usd            else null end,
    'price_input_amount',   case when v_can_price then v_aw.price_input_amount   else null end,
    'price_input_currency', case when v_can_price then v_aw.price_input_currency else null end,
    'fx_rate_to_usd',       case when v_can_price then v_aw.fx_rate_to_usd       else null end,
    'fx_date',              case when v_can_price then v_aw.fx_date              else null end,
    'story',                case when v_can_desc  then v_aw.story                else null end,
    'artwork_images', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('storage_path', ai.storage_path, 'sort_order', ai.sort_order)
          order by ai.sort_order nulls last
        ),
        '[]'::jsonb
      )
      from public.artwork_images ai
      where ai.artwork_id = v_aw.id
    ),
    'profiles', (
      select jsonb_build_object(
        'id', p.id,
        'username', p.username,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url,
        'bio', p.bio,
        'main_role', p.main_role,
        'roles', p.roles
      )
      from public.profiles p
      where p.id = v_owner
    ),
    'artwork_likes', (
      select jsonb_build_array(jsonb_build_object('count', count(*)))
      from public.artwork_likes al
      where al.artwork_id = v_aw.id
    ),
    'claims', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'claim_type', c.claim_type,
            'subject_profile_id', c.subject_profile_id,
            'artist_profile_id', c.artist_profile_id,
            'external_artist_id', c.external_artist_id,
            'created_at', c.created_at,
            'status', c.status,
            'period_status', c.period_status,
            'start_date', c.start_date,
            'end_date', c.end_date,
            'profiles', (
              select jsonb_build_object(
                'username', sp.username,
                'display_name', sp.display_name
              )
              from public.profiles sp
              where sp.id = c.subject_profile_id
            ),
            'external_artists', (
              select jsonb_build_object(
                'display_name', ea.display_name
              )
              from public.external_artists ea
              where ea.id = c.external_artist_id
            )
          )
          order by c.created_at desc
        ),
        '[]'::jsonb
      )
      from public.claims c
      where c.work_id = v_aw.id
    )
  );

  return jsonb_build_object(
    'artwork', v_artwork,
    'visibility', jsonb_build_object(
      'price',        v_price,
      'availability', v_avail,
      'description',  v_desc
    ),
    'presence', jsonb_build_object(
      'price', (
        v_aw.pricing_mode is not null
        or v_aw.price_usd is not null
        or v_aw.price_input_amount is not null
      ),
      'availability', (v_aw.ownership_status is not null),
      'description', (
        v_aw.story is not null and length(btrim(v_aw.story)) > 0
      )
    ),
    'relationship', v_relationship,
    'viewer_id',    v_uid
  );
end;
$hotfix$;

grant execute on function public.get_artwork_passport_for_viewer(uuid) to authenticated;
grant execute on function public.get_artwork_passport_for_viewer(uuid) to anon;
