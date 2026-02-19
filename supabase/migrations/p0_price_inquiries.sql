-- Price inquiries: inquirer asks for price on "Price upon request" or price-hidden works; artist can reply.

create table if not exists public.price_inquiries (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references public.artworks(id) on delete cascade,
  inquirer_id uuid not null references public.profiles(id) on delete cascade,
  message text,
  artist_reply text,
  replied_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_price_inquiries_artwork on public.price_inquiries(artwork_id);
create index if not exists idx_price_inquiries_inquirer on public.price_inquiries(inquirer_id);
create index if not exists idx_price_inquiries_created on public.price_inquiries(created_at desc);

alter table public.price_inquiries enable row level security;

-- Inquirer: insert own; select own
create policy price_inquiries_insert_own on public.price_inquiries
  for insert to authenticated
  with check (inquirer_id = auth.uid());

create policy price_inquiries_select_own on public.price_inquiries
  for select to authenticated
  using (inquirer_id = auth.uid());

-- Artist (artwork owner): select inquiries for own artworks; update (reply) for own artworks
create policy price_inquiries_select_artist on public.price_inquiries
  for select to authenticated
  using (
    exists (
      select 1 from public.artworks a
      where a.id = price_inquiries.artwork_id and a.artist_id = auth.uid()
    )
  );

create policy price_inquiries_update_artist on public.price_inquiries
  for update to authenticated
  using (
    exists (
      select 1 from public.artworks a
      where a.id = price_inquiries.artwork_id and a.artist_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.artworks a
      where a.id = price_inquiries.artwork_id and a.artist_id = auth.uid()
    )
  );

grant select, insert on public.price_inquiries to authenticated;
grant update on public.price_inquiries to authenticated;

-- Extend notifications type enum (drop and re-add check constraint)
do $$
begin
  alter table public.notifications drop constraint if exists notifications_type_check;
exception when others then null;
end $$;

alter table public.notifications add constraint notifications_type_check check (
  type in (
    'like', 'follow', 'claim_request', 'claim_confirmed', 'claim_rejected',
    'price_inquiry', 'price_inquiry_reply'
  )
);

-- Notify artist when someone sends a price inquiry
create or replace function public.notify_on_price_inquiry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artist_id uuid;
begin
  select artist_id into v_artist_id from public.artworks where id = new.artwork_id;
  if v_artist_id is null or v_artist_id = new.inquirer_id then
    return new;
  end if;
  insert into public.notifications (user_id, type, actor_id, artwork_id, payload)
  values (v_artist_id, 'price_inquiry', new.inquirer_id, new.artwork_id, jsonb_build_object('inquiry_id', new.id));
  return new;
end;
$$;

drop trigger if exists on_price_inquiry_notify on public.price_inquiries;
create trigger on_price_inquiry_notify
  after insert on public.price_inquiries
  for each row execute function public.notify_on_price_inquiry();

-- Notify inquirer when artist replies
create or replace function public.notify_on_price_inquiry_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.artist_reply is null or old.artist_reply is not null then
    return new;
  end if;
  insert into public.notifications (user_id, type, actor_id, artwork_id, payload)
  values (new.inquirer_id, 'price_inquiry_reply', (
    select artist_id from public.artworks where id = new.artwork_id limit 1
  ), new.artwork_id, jsonb_build_object('inquiry_id', new.id));
  return new;
end;
$$;

drop trigger if exists on_price_inquiry_reply_notify on public.price_inquiries;
create trigger on_price_inquiry_reply_notify
  after update on public.price_inquiries
  for each row execute function public.notify_on_price_inquiry_reply();
