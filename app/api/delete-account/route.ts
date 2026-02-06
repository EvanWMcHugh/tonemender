import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Server-side Supabase client (service role key required)
const supabaseServer = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);

function jsonNoStore(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const t = authHeader.slice(7).trim();
    return t.length ? t : null;
  }
  return null;
}

export async function POST(req: Request) {
  try {
    // Parse body safely
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const tokenFromBody = body?.token;
    const token = getBearerToken(req) || tokenFromBody;

    if (!token || typeof token !== "string") {
      return jsonNoStore({ error: "Missing auth token" }, { status: 400 });
    }

    // Verify caller is a real logged-in user
    const { data: authData, error: authError } =
      await supabaseServer.auth.getUser(token);

    if (authError || !authData?.user) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authData.user.id;

    // Fetch profile data for optional cleanup (Stripe metadata)
    const { data: profile } = await supabaseServer
      .from("profiles")
      .select("stripe_customer_id, stripe_subscription_id")
      .eq("id", userId)
      .single();

    // Clean up user-owned rows (add/remove tables as needed)
    // Best-effort deletes so one failure doesn’t block account deletion
    try {
      await supabaseServer.from("messages").delete().eq("user_id", userId);
    } catch {}

    try {
      await supabaseServer.from("rewrite_usage").delete().eq("user_id", userId);
    } catch {}

    try {
      // profiles is usually 1:1 with auth user id
      await supabaseServer.from("profiles").delete().eq("id", userId);
    } catch {}

    // If you store drafts in a different table, delete them too (safe if table doesn't exist? No—so only add if real)
    // await supabaseServer.from("drafts").delete().eq("user_id", userId);

    // Delete user from Supabase Auth
    const { error: deleteError } = await supabaseServer.auth.admin.deleteUser(
      userId
    );

    if (deleteError) {
      return jsonNoStore({ error: deleteError.message }, { status: 500 });
    }

    return jsonNoStore({
      success: true,
      // Optional: return these so you can reconcile externally if needed
      stripe_customer_id: profile?.stripe_customer_id ?? null,
      stripe_subscription_id: profile?.stripe_subscription_id ?? null,
    });
  } catch (err) {
    console.error("DELETE ACCOUNT ERROR:", err);
    return jsonNoStore(
      { error: "Server error while deleting account" },
      { status: 500 }
    );
  }
}