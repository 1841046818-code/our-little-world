create extension if not exists pgcrypto;

create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  relationship_date date,
  music_path text,
  music_title text,
  created_at timestamptz not null default now()
);

create table if not exists public.couple_members (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text,
  joined_at timestamptz not null default now(),
  primary key (couple_id, user_id),
  unique (user_id)
);

create table if not exists public.couple_invites (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  code text not null unique check (code ~ '^[0-9]{6}$'),
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.shared_entries (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('note', 'whisper', 'memory', 'todo', 'place', 'cycle', 'anniversary', 'event')),
  title text not null default '',
  body text not null default '',
  entry_date date not null default current_date,
  done boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shared_entries_couple_kind_date_idx
  on public.shared_entries (couple_id, kind, entry_date desc, created_at desc);

create table if not exists public.member_locations (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m double precision,
  updated_at timestamptz not null default now(),
  primary key (couple_id, user_id)
);

create or replace function public.is_couple_member(target_couple uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.couple_members
    where couple_id = target_couple and user_id = (select auth.uid())
  );
$$;

create or replace function public.create_couple_space(p_relationship_date date default null)
returns table (couple_id uuid, invite_code text)
language plpgsql security definer set search_path = public
as $$
declare
  new_couple uuid;
  new_code text;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  if exists (select 1 from public.couple_members where user_id = auth.uid()) then
    raise exception 'You already belong to a couple space';
  end if;
  insert into public.couples (created_by, relationship_date)
    values (auth.uid(), p_relationship_date) returning id into new_couple;
  insert into public.couple_members (couple_id, user_id, nickname)
    values (new_couple, auth.uid(), nullif(auth.jwt() -> 'user_metadata' ->> 'nickname', ''));
  loop
    new_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.couple_invites where code = new_code and expires_at > now());
  end loop;
  insert into public.couple_invites (couple_id, code, created_by)
    values (new_couple, new_code, auth.uid());
  return query select new_couple, new_code;
end;
$$;

create or replace function public.join_couple_space(p_code text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  invite public.couple_invites%rowtype;
  member_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  if exists (select 1 from public.couple_members where user_id = auth.uid()) then
    raise exception 'You already belong to a couple space';
  end if;
  select * into invite from public.couple_invites
    where code = p_code and used_at is null and expires_at > now() for update;
  if invite.id is null then raise exception 'This invitation is invalid or has expired'; end if;
  select count(*) into member_count from public.couple_members where couple_id = invite.couple_id;
  if member_count >= 2 then raise exception 'This couple space is already full'; end if;
  insert into public.couple_members (couple_id, user_id, nickname)
    values (invite.couple_id, auth.uid(), nullif(auth.jwt() -> 'user_metadata' ->> 'nickname', ''));
  update public.couple_invites set used_at = now() where id = invite.id;
  return invite.couple_id;
end;
$$;

alter table public.couples enable row level security;
alter table public.couple_members enable row level security;
alter table public.couple_invites enable row level security;
alter table public.shared_entries enable row level security;
alter table public.member_locations enable row level security;

grant select on public.couples, public.couple_members, public.couple_invites to authenticated;
grant update (relationship_date, music_path, music_title) on public.couples to authenticated;
grant select, insert, update, delete on public.shared_entries to authenticated;
grant select, insert, update, delete on public.member_locations to authenticated;

drop policy if exists "members can read their couple" on public.couples;
create policy "members can read their couple" on public.couples
  for select to authenticated using (public.is_couple_member(id));
drop policy if exists "members can update their couple" on public.couples;
create policy "members can update their couple" on public.couples
  for update to authenticated using (public.is_couple_member(id)) with check (public.is_couple_member(id));
drop policy if exists "members can read membership" on public.couple_members;
create policy "members can read membership" on public.couple_members
  for select to authenticated using (public.is_couple_member(couple_id));
drop policy if exists "members can read invites" on public.couple_invites;
create policy "members can read invites" on public.couple_invites
  for select to authenticated using (public.is_couple_member(couple_id));
drop policy if exists "members can create invites" on public.couple_invites;
create policy "members can create invites" on public.couple_invites
  for insert to authenticated with check (public.is_couple_member(couple_id) and created_by = (select auth.uid()));

drop policy if exists "members can read shared entries" on public.shared_entries;
create policy "members can read shared entries" on public.shared_entries
  for select to authenticated using (public.is_couple_member(couple_id));
drop policy if exists "members can create shared entries" on public.shared_entries;
create policy "members can create shared entries" on public.shared_entries
  for insert to authenticated with check (public.is_couple_member(couple_id) and created_by = (select auth.uid()));
drop policy if exists "members can update shared entries" on public.shared_entries;
create policy "members can update shared entries" on public.shared_entries
  for update to authenticated using (public.is_couple_member(couple_id)) with check (public.is_couple_member(couple_id));
drop policy if exists "members can delete shared entries" on public.shared_entries;
create policy "members can delete shared entries" on public.shared_entries
  for delete to authenticated using (public.is_couple_member(couple_id));

drop policy if exists "members can read locations" on public.member_locations;
create policy "members can read locations" on public.member_locations
  for select to authenticated using (public.is_couple_member(couple_id));
drop policy if exists "members can insert their location" on public.member_locations;
create policy "members can insert their location" on public.member_locations
  for insert to authenticated with check (public.is_couple_member(couple_id) and user_id = (select auth.uid()));
drop policy if exists "members can update their location" on public.member_locations;
create policy "members can update their location" on public.member_locations
  for update to authenticated using (public.is_couple_member(couple_id) and user_id = (select auth.uid()))
  with check (public.is_couple_member(couple_id) and user_id = (select auth.uid()));
drop policy if exists "members can delete their location" on public.member_locations;
create policy "members can delete their location" on public.member_locations
  for delete to authenticated using (public.is_couple_member(couple_id) and user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('couple-music', 'couple-music', false, 20971520,
  array['audio/mpeg','audio/mp4','audio/wav','audio/ogg','audio/aac','audio/webm'])
on conflict (id) do nothing;

drop policy if exists "couple members can read shared music" on storage.objects;
create policy "couple members can read shared music" on storage.objects
  for select to authenticated using (
    bucket_id = 'couple-music' and exists (
      select 1 from public.couples c
      where c.id::text = (storage.foldername(name))[1] and public.is_couple_member(c.id)
    )
  );
drop policy if exists "couple members can upload shared music" on storage.objects;
create policy "couple members can upload shared music" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'couple-music' and exists (
      select 1 from public.couples c
      where c.id::text = (storage.foldername(name))[1] and public.is_couple_member(c.id)
    )
  );
drop policy if exists "couple members can update shared music" on storage.objects;
create policy "couple members can update shared music" on storage.objects
  for update to authenticated using (
    bucket_id = 'couple-music' and exists (
      select 1 from public.couples c
      where c.id::text = (storage.foldername(name))[1] and public.is_couple_member(c.id)
    )
  ) with check (
    bucket_id = 'couple-music' and exists (
      select 1 from public.couples c
      where c.id::text = (storage.foldername(name))[1] and public.is_couple_member(c.id)
    )
  );
drop policy if exists "couple members can delete shared music" on storage.objects;
create policy "couple members can delete shared music" on storage.objects
  for delete to authenticated using (
    bucket_id = 'couple-music' and exists (
      select 1 from public.couples c
      where c.id::text = (storage.foldername(name))[1] and public.is_couple_member(c.id)
    )
  );

revoke all on function public.create_couple_space(date) from public, anon;
revoke all on function public.join_couple_space(text) from public, anon;
revoke all on function public.is_couple_member(uuid) from public, anon;
grant execute on function public.create_couple_space(date) to authenticated;
grant execute on function public.join_couple_space(text) to authenticated;
grant execute on function public.is_couple_member(uuid) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.shared_entries;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.couples;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.member_locations;
exception when duplicate_object then null;
end $$;
