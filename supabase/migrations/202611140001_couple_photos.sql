insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'couple-photos',
  'couple-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update
set file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "couple members can read shared photos" on storage.objects;
create policy "couple members can read shared photos" on storage.objects
  for select to authenticated using (
    bucket_id = 'couple-photos' and exists (
      select 1 from public.couples c
      where c.id::text = (storage.foldername(name))[1]
        and public.is_couple_member(c.id)
    )
  );

drop policy if exists "members can upload their couple photos" on storage.objects;
create policy "members can upload their couple photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'couple-photos'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and exists (
      select 1 from public.couples c
      where c.id::text = (storage.foldername(name))[1]
        and public.is_couple_member(c.id)
    )
  );

drop policy if exists "members can delete their couple photos" on storage.objects;
create policy "members can delete their couple photos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'couple-photos'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and exists (
      select 1 from public.couples c
      where c.id::text = (storage.foldername(name))[1]
        and public.is_couple_member(c.id)
    )
  );
