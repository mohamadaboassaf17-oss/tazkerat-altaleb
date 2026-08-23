import { createClient } from '@supabase/supabase-js';

/**
 * Singleton Supabase browser client.
 *
 * Fails fast at module init when the public env vars are missing — a
 * misconfigured deployment must crash loudly instead of continuing with
 * `undefined` credentials and failing later in confusing ways.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error(
    'Missing VITE_SUPABASE_URL — set it in .env (see .env.example: رابط مشروع Supabase من لوحة التحكم).',
  );
}

if (!supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_ANON_KEY — set it in .env (see .env.example: مفتاح anon العام لـ Supabase).',
  );
}

/**
 * The concrete generic defaults of `SupabaseClient` differ between supabase-js
 * releases; `ReturnType<typeof createClient>` stays accurate across upgrades
 * and keeps the singleton fully typed without unsafe assertions.
 */
export const supabase: ReturnType<typeof createClient> = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      flowType: 'pkce',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  },
);
