import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client.
 * Uses the Service Role key — MUST never be imported into client components.
 */
export const supabaseServer = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  {
    auth: {
      persistSession: false, // never persist sessions on the server
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);