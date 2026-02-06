import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

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

export async function POST(req: Request) {
  try {
    // Parse body safely
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const token = body?.token;

    if (!token || typeof token !== "string") {
      return jsonNoStore({ error: "Missing token" }, { status: 400 });
    }

    // Look up subscriber by confirm_token
    const { data, error } = await supabaseServer
      .from("newsletter_subscribers")
      .select("id, email, confirmed")
      .eq("confirm_token", token)
      .single();

    if (error || !data) {
      return jsonNoStore({ error: "Invalid token" }, { status: 400 });
    }

    // If already confirmed, treat as success (idempotent)
    if (data.confirmed) {
      return jsonNoStore({ success: true, email: data.email });
    }

    const { error: updateError } = await supabaseServer
      .from("newsletter_subscribers")
      .update({
        confirmed: true,
        confirmed_at: new Date().toISOString(),
        confirm_token: null,
      })
      .eq("id", data.id);

    if (updateError) {
      return jsonNoStore({ error: "Failed to confirm" }, { status: 500 });
    }

    return jsonNoStore({ success: true, email: data.email });
  } catch (err) {
    console.error("CONFIRM ERROR:", err);
    return jsonNoStore(
      { error: "Server error while confirming" },
      { status: 500 }
    );
  }
}