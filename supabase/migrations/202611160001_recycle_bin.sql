alter table public.shared_entries
  add column if not exists deleted_at timestamptz;

create index if not exists shared_entries_trash_cleanup_idx
  on public.shared_entries (couple_id, deleted_at)
  where deleted_at is not null;

drop policy if exists "members can delete their couple photos" on storage.objects;
create policy "members can delete their couple photos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'couple-photos' and exists (
      select 1 from public.couples c
      where c.id::text = (storage.foldername(name))[1]
        and public.is_couple_member(c.id)
    )
  );
