import { createClient } from '@supabase/supabase-js';

/**
 * Supabase client (browser). Configuration comes from Vite env variables:
 *   VITE_SUPABASE_URL       - https://<project-ref>.supabase.co
 *   VITE_SUPABASE_ANON_KEY  - publishable / anon key (safe to expose; RLS protects the data)
 *
 * Locally put them in ".env.local". On GitHub Pages they are injected at build time by the
 * workflow (see .github/workflows/deploy.yml and the repository's Actions secrets/variables).
 */

// Public by design (it only grants what Row Level Security allows), so it is safe as a fallback.
const FALLBACK_ANON_KEY = 'sb_publishable_SEq43D0tLSS5wu-njKs-uw_b6pTOux6';

// Public project URL (not a secret). Env variables override these fallbacks.
const FALLBACK_URL = 'https://ktfizgafwmqguiaaszsx.supabase.co';

const url = import.meta.env.VITE_SUPABASE_URL?.trim() || FALLBACK_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || FALLBACK_ANON_KEY;

/** Always true now that a fallback URL exists; kept so the UI can still degrade if it is ever blank. */
export const isSupabaseConfigured = Boolean(url);

if (!isSupabaseConfigured) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL is not set. Copy .env.example to .env.local and fill in your project URL.',
  );
}

export const supabase = createClient(
  // A syntactically valid placeholder keeps createClient() from throwing when the URL is missing.
  url || 'https://not-configured.supabase.co',
  anonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // HashRouter owns the URL hash
    },
    realtime: { params: { eventsPerSecond: 10 } },
  },
);
