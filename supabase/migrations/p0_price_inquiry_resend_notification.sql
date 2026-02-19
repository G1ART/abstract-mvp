-- Allow inquirer to resend price_inquiry notification for their own unanswered inquiry
-- (fixes pre-patch inquiries where artist never received notification).
-- Also one-time backfill: insert notifications for existing unanswered inquiries
-- where the artist/delegates may not have received one.

-- RPC: inquirer resends notification for one of their unanswered inquiries
create or replace function public.resend_price_inquiry_notification(p_inquiry_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inq record;
  v_recipient uuid;
  v_count int := 0;
begin
  select artwork_id, inquirer_id, replied_at into v_inq
  from public.price_inquiries where id = p_inquiry_id;
  if not found then
    return 0;
  end if;
  if v_inq.inquirer_id <> auth.uid() then
    return 0;
  end if;
  if v_inq.replied_at is not null then
    return 0;
  end if;

  for v_recipient in
    select * from public.get_price_inquiry_recipient_ids(v_inq.artwork_id, v_inq.inquirer_id)
  loop
    insert into public.notifications (user_id, type, actor_id, artwork_id, payload)
    values (v_recipient, 'price_inquiry', v_inq.inquirer_id, v_inq.artwork_id, jsonb_build_object('inquiry_id', p_inquiry_id));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

comment on function public.resend_price_inquiry_notification(uuid) is 'Inquirer resends price_inquiry notification to artist/delegates for their own unanswered inquiry. Returns number of notifications sent.';

grant execute on function public.resend_price_inquiry_notification(uuid) to authenticated;

-- One-time backfill: for each unanswered inquiry, ensure each recipient has a price_inquiry notification
-- (skips if one already exists for that user + inquiry_id so we do not duplicate)
insert into public.notifications (user_id, type, actor_id, artwork_id, payload)
select r.uid, 'price_inquiry', pi.inquirer_id, pi.artwork_id, jsonb_build_object('inquiry_id', pi.id)
from public.price_inquiries pi
cross join lateral (
  select * from public.get_price_inquiry_recipient_ids(pi.artwork_id, pi.inquirer_id)
) r(uid)
where pi.replied_at is null
  and not exists (
    select 1 from public.notifications n
    where n.user_id = r.uid
      and n.type = 'price_inquiry'
      and (n.payload->>'inquiry_id') = pi.id::text
  );
