import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sha256 } from "@/lib/authTokens";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { token } = await req.json();
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

    const tokenHash = sha256(token);

    const { data, error } = await supabaseAdmin
      .from("signup_confirm_tokens")
      .select("id,user_id,expires_at,used_at")
      .eq("token_hash", tokenHash)
      .limit(1);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const row = data?.[0];
    if (!row) return NextResponse.json({ error: "Invalid link" }, { status: 400 });
    if (row.used_at) return NextResponse.json({ error: "Link already used" }, { status: 400 });

    if (new Date(row.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "Link expired" }, { status: 400 });
    }

    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({ email_verified: true })
      .eq("id", row.user_id);

    if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

    const { error: usedErr } = await supabaseAdmin
      .from("signup_confirm_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", row.id);

    if (usedErr) return NextResponse.json({ error: usedErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}