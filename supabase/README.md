# Supabase setup

The app uses Supabase Auth, Postgres, Realtime, and a private Storage bucket. The browser only needs the project URL and the public anon/publishable key; never put a `service_role` key in the frontend.

## Connect a project

1. Create a Supabase project and copy its Project URL and anon/publishable key from the project API settings.
2. Copy `.env.example` to `.env.local` in the project root and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. In Supabase SQL Editor, run migrations in order: `202611130001_couple_space.sql`, `202611140001_couple_photos.sql`, `202611160001_recycle_bin.sql`, and `202611180001_memory_albums.sql`.
4. In Authentication settings, set the site URL and allowed redirect URLs to the deployed app origin and local preview origin. Configure email delivery before inviting the other person to register.
5. Restart Vite after changing `.env.local`, then register both accounts. One person creates a couple space and sends the six digit code; the other joins with it.

The migrations create row-level security policies for couple membership, shared records, locations, and private music and photo storage. Review the policies before applying them to an existing project with tables of the same names.

## AI care suggestions

The `care-ai` Edge Function uses an OpenAI-compatible Chat Completions API. Configure these project Edge Function secrets in Supabase Dashboard > Edge Functions > Secrets:

- `AI_BASE_URL`: the provider base URL, for example `https://api.example.com/v1` (do not append `/chat/completions`).
- `AI_API_KEY`: the provider API key. Keep it in Supabase secrets; never put it in `.env.local` or browser code.
- `AI_MODEL`: the model name enabled for that key.

Deploy with `npx supabase functions deploy care-ai --use-api`. The app only sends the last eight period-start dates and current date/time after the user presses “AI 帮我写一句”. The function verifies the signed-in couple member, applies a per-user request limit, and keeps the provider key server-side. It does not send names, locations, photos, notes, or symptom descriptions.

## Recycle bin

Shared entries are soft-deleted into a couple-wide recycle bin and can be restored for seven days. After deploying the `purge-trash` Edge Function, add the project URL and a current secret key in Supabase Vault under the names `project_url` and `secret_key`, then run `202611160002_schedule_trash_cleanup.sql`. Cleanup will run hourly while both partners are offline. The function removes attached private photos through Storage before permanently deleting the entry. The secret key belongs only in Supabase Vault and must never be added to `.env.local` or frontend code.

## Location sharing

After a member signs in and joins the couple space, the app automatically requests location permission and starts sharing on that device when allowed. Each partner must grant permission on their own device; the app must be served from HTTPS (localhost is also allowed). The app writes at most one location update every ten seconds and deletes that member's shared row when they sign out. A location older than two minutes is treated as offline.

## Local preview

```powershell
Copy-Item .env.example .env.local
npm run dev
```

Edit `.env.local` with the project's public values before restarting the server. Without those values, the app remains in local demo mode and does not connect to Supabase.
