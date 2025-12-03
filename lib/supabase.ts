// lib/supabase.ts

import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,

      // Only enable localStorage on the client
      storage:
        typeof window !== "undefined" ? window.localStorage : undefined,
    },
  }
);