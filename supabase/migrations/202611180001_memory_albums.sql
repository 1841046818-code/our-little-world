create table if not exists public.memory_albums (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 48),
  created_at timestamptz not null default now(),
  unique (couple_id, name)
);

alter table public.memory_albums enable row level security;
grant select, insert on public.memory_albums to authenticated;

drop policy if exists "members can read memory albums" on public.memory_albums;
create policy "members can read memory albums" on public.memory_albums
  for select to authenticated using (public.is_couple_member(couple_id));

drop policy if exists "members can create memory albums" on public.memory_albums;
create policy "members can create memory albums" on public.memory_albums
  for insert to authenticated
  with check (public.is_couple_member(couple_id) and created_by = (select auth.uid()));

alter publication supabase_realtime add table public.memory_albums;
