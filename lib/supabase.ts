"use client";

import { createClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client (ANON key)
 *
 * ✅ OK to use for: public reads/writes you intentionally allow via RLS
 * 🚫 NOT used for authentication anymore (custom auth uses HttpOnly tm_session cookie + DB sessions table)
 *
 * If you still have any pages using supabase.auth.getSession(), remove those calls.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}
if (!SUPABASE_ANON_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // ✅ Your app no longer uses Supabase Auth
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});