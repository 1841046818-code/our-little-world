import { withSupabase } from 'npm:@supabase/server@1';

export default {
  fetch: withSupabase({ auth: 'secret' }, async (request, context) => {
    if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

    const supabase = context.supabaseAdmin;
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: expired, error: selectError } = await supabase
      .from('shared_entries')
      .select('id,metadata')
      .not('deleted_at', 'is', null)
      .lte('deleted_at', cutoff);

    if (selectError) return Response.json({ error: selectError.message }, { status: 500 });
    if (!expired?.length) return Response.json({ deleted: 0 });

    const photoEntries = expired.filter(row => row.metadata?.photo_path);
    const plainIds = expired.filter(row => !row.metadata?.photo_path).map(row => row.id);
    let deleted = 0;

    if (plainIds.length) {
      const { error } = await supabase.from('shared_entries').delete().in('id', plainIds);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      deleted += plainIds.length;
    }

    for (let offset = 0; offset < photoEntries.length; offset += 1000) {
      const batch = photoEntries.slice(offset, offset + 1000);
      const paths = batch.map(row => row.metadata.photo_path);
      const { error: storageError } = await supabase.storage.from('couple-photos').remove(paths);
      if (storageError) continue;

      const { error: deleteError } = await supabase.from('shared_entries').delete().in('id', batch.map(row => row.id));
      if (deleteError) {
        return Response.json({ error: deleteError.message, deleted }, { status: 500 });
      }
      deleted += batch.length;
    }

    return Response.json({ deleted, pendingPhotos: photoEntries.length - Math.max(0, deleted - plainIds.length) });
  }),
};
