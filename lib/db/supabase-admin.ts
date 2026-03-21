// lib/db/supabase-admin.ts
import "server-only";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL) {
  throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");
}

if (!SUPABASE_SERVICE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)");
}

/**
 * Server-side Supabase admin client.
 *
 * Uses the service role key for privileged database access.
 * This client must only be imported from server code.
 *
 * IMPORTANT:
 * - Never import this into client components.
 * - Service role access bypasses RLS.
 * - Supabase Auth is not used for application sessions.
 */
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  db: {
    schema: "public",
  },
});