import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sha256Hex } from "@/lib/security";

export const runtime = "nodejs";

function jsonNoStore(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function isExpired(expiresAt: string) {
  const t = new Date(expiresAt).getTime();
  return Number.isNaN(t) || t < Date.now();
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = body?.token;

    if (!token || typeof token !== "string") {
      return jsonNoStore({ error: "Missing token" }, { status: 400 });
    }

    const tokenHash = sha256Hex(token);

    // 1) Find token row
    const { data: row, error: findErr } = await supabaseAdmin
      .from("email_verification_tokens")
      .select("id,user_id,expires_at,consumed_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (findErr || !row) {
      return jsonNoStore({ error: "Invalid link" }, { status: 400 });
    }

    // Idempotent success
    if (row.consumed_at) {
      return jsonNoStore({ ok: true, success: true });
    }

    if (!row.expires_at || isExpired(row.expires_at)) {
      return jsonNoStore({ error: "Link expired" }, { status: 400 });
    }

    const nowIso = new Date().toISOString();

    // 2) Consume token first with a guard (race-safe)
    // If someone else consumes it between read and update, treat as success.
    const { data: consumed, error: consumeErr } = await supabaseAdmin
      .from("email_verification_tokens")
      .update({ consumed_at: nowIso })
      .eq("id", row.id)
      .is("consumed_at", null)
      .select("id")
      .maybeSingle();

    if (consumeErr) {
      return jsonNoStore({ error: "Failed to confirm" }, { status: 500 });
    }

    if (!consumed?.id) {
      return jsonNoStore({ ok: true, success: true });
    }

    // 3) Mark user verified (idempotent)
    const { error: userErr } = await supabaseAdmin
      .from("users")
      .update({ email_verified_at: nowIso })
      .eq("id", row.user_id);

    if (userErr) {
      // Roll back token consumption so user can retry if the user update failed
      try {
        await supabaseAdmin
          .from("email_verification_tokens")
          .update({ consumed_at: null })
          .eq("id", row.id);
      } catch {}
      return jsonNoStore({ error: "Failed to verify email" }, { status: 500 });
    }

    return jsonNoStore({ ok: true, success: true });
  } catch (err: any) {
    console.error("CONFIRM SIGNUP ERROR:", err);
    return jsonNoStore({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}