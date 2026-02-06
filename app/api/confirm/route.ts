import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sha256 } from "@/lib/authTokens";

export const runtime = "nodejs";

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

    const tokenHash = sha256(token);

    // Look up subscriber by confirm_token_hash
    const { data, error } = await supabaseAdmin
      .from("newsletter_subscribers")
      .select("id, email, confirmed")
      .eq("confirm_token_hash", tokenHash)
      .single();

    if (error || !data) {
      return jsonNoStore({ error: "Invalid token" }, { status: 400 });
    }

    // If already confirmed, treat as success (idempotent)
    if (data.confirmed) {
      return jsonNoStore({ success: true, email: data.email });
    }

    const { error: updateError } = await supabaseAdmin
      .from("newsletter_subscribers")
      .update({
        confirmed: true,
        confirmed_at: new Date().toISOString(),
        confirm_token_hash: null,
      })
      .eq("id", data.id);

    if (updateError) {
      return jsonNoStore({ error: "Failed to confirm" }, { status: 500 });
    }

    return jsonNoStore({ success: true, email: data.email });
  } catch (err) {
    console.error("CONFIRM ERROR:", err);
    return jsonNoStore({ error: "Server error while confirming" }, { status: 500 });
  }
}