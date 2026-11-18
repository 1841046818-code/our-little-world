import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasSupabaseConfig = Boolean(url && key);
export const supabase = hasSupabaseConfig
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Capacitor's native HTTP patch resets some auth connections; keep auth on WebView fetch.
        fetch: (input, init) => {
          const webFetch = window.CapacitorWebFetch || window.fetch;
          return webFetch.call(window, input, init);
        },
      },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null;
