-- Sprint 7 Phase 0.1 — Passport DTO owner profile minimization.
--
-- Carries forward `get_artwork_passport_for_viewer` byte-for-byte from
-- migration 20260610000000 (Sprint 6.1) with one targeted change:
-- the nested owner `'profiles'` block now redacts `bio`, `main_role`,
-- and `roles` to NULL when the owner profile is *not* marked public
-- AND the caller is not the owner / active delegate writer.
--
-- Rationale (Sprint 7 work order §2.1 — Phase 0 carryover closure):
-- Sprint 6.1 already minimized the artwork-row level (no whole-row
-- to_jsonb, redacted created_by, no invite_email, no is_public).
-- The remaining trust gap was that nested owner profile fields like
-- `bio`, `main_role`, and `roles` were being returned to anonymous
-- and unrelated viewers regardless of whether the profile owner had
-- consented to a public profile (`profiles.is_public`). For private
-- profiles, those three fields can leak biographical / role context
-- that the owner has explicitly opted out of. Minimizing them here
-- aligns the passport with the existing public profile gate.
--
-- DTO shape is preserved — only the *values* of bio / main_role /
-- roles flip to null for non-owner/delegate viewers of private
-- profiles. Existing TS type `RedactedArtworkPassport.profiles`
-- already declares all three as nullable, so no client breakage.
--
-- Single function redefine — no SECTION banners required.
-- Letters-only dollar tag (`$pport$`) per release-workflow.mdc.

create or replace function public.get_artwork_passport_for_viewer(
  p_artwork_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $pport$
declare
  v_uid uuid := auth.uid();
  v_aw record;
  v_owner uuid;
  v_vis_text text;
  v_is_owner_or_delegate boolean;
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

  v_is_owner_or_delegate :=
    v_uid is not null
    and (v_uid = v_owner
         or public.is_active_account_delegate_writer(v_owner));

  if v_vis_text <> 'public' then
    if not v_is_owner_or_delegate then
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
    'created_by', case when v_is_owner_or_delegate then v_aw.created_by else null end,
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
    -- Sprint 7 Phase 0.1: nested owner profile minimization.
    -- For non-owner / non-delegate viewers of a profile that is NOT
    -- marked public (`coalesce(is_public, true) = false`), reduce
    -- bio / main_role / roles to null. Identity fields (id, username,
    -- display_name, avatar_url) remain so that the artwork credit
    -- line and avatar still render — those are the same fields we
    -- already expose via the public lookup_profile RPC.
    'profiles', (
      select jsonb_build_object(
        'id', p.id,
        'username', p.username,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url,
        'bio',
          case
            when v_is_owner_or_delegate then p.bio
            when coalesce(p.is_public, true) then p.bio
            else null
          end,
        'main_role',
          case
            when v_is_owner_or_delegate then p.main_role
            when coalesce(p.is_public, true) then p.main_role
            else null
          end,
        'roles',
          case
            when v_is_owner_or_delegate then p.roles
            when coalesce(p.is_public, true) then p.roles
            else null
          end
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
$pport$;

grant execute on function public.get_artwork_passport_for_viewer(uuid) to authenticated;
grant execute on function public.get_artwork_passport_for_viewer(uuid) to anon;
