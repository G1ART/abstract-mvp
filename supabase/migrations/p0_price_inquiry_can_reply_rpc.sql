-- RPC: whether the current user can reply to price inquiries for an artwork.
-- Uses the same artist resolution as notifications/RLS (price_inquiry_artist_id = CREATED claim).
-- Enables the artwork page to show the reply block for the correct user.

create or replace function public.can_reply_to_price_inquiry(p_artwork_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.price_inquiry_artist_id(p_artwork_id) = auth.uid();
$$;

comment on function public.can_reply_to_price_inquiry(uuid) is 'True if current user is the price-inquiry artist (CREATED claim) for the artwork.';

grant execute on function public.can_reply_to_price_inquiry(uuid) to authenticated;
