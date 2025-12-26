import { createClient } from "@supabase/supabase-js";

// ✅ Use NEW secret key here (server-side only!)
export const supabaseServer = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);