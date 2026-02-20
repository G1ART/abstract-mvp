-- Fix: "new row violates row-level security" when artist/delegate replies to a price inquiry.
-- Cause: price_inquiries_update_reply had WITH CHECK (replied_at is null ...). After update we set
-- replied_at, so the new row failed the check. USING already restricts to unreplied rows; WITH CHECK
-- must only require that the updater is still artist or delegate (allow the updated row with replied_at set).

drop policy if exists price_inquiries_update_reply on public.price_inquiries;

create policy price_inquiries_update_reply on public.price_inquiries
  for update to authenticated
  using (
    replied_at is null
    and public.can_reply_to_price_inquiry(artwork_id) = true
  )
  with check (public.can_reply_to_price_inquiry(artwork_id) = true);
