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

    // 1) Lookup request
    const { data: reqRow, error: findErr } = await supabaseAdmin
      .from("email_change_requests")
      .select("id,user_id,old_email,new_email,expires_at,confirmed_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (findErr || !reqRow) {
      return jsonNoStore({ error: "Invalid token" }, { status: 400 });
    }

    // Idempotent success
    if (reqRow.confirmed_at) {
      return jsonNoStore({ ok: true, success: true });
    }

    if (!reqRow.expires_at || isExpired(reqRow.expires_at)) {
      return jsonNoStore({ error: "Link expired" }, { status: 400 });
    }

    const newEmail = String(reqRow.new_email || "").trim().toLowerCase();
    if (!newEmail) {
      return jsonNoStore({ error: "Invalid request" }, { status: 400 });
    }

    // 2) Prevent switching to an email used by someone else
    const { data: existing, error: existErr } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("email", newEmail)
      .maybeSingle();

    if (existErr) {
      return jsonNoStore({ error: "Could not validate email" }, { status: 500 });
    }
    if (existing && existing.id !== reqRow.user_id) {
      return jsonNoStore({ error: "Unable to use that email address." }, { status: 400 });
    }

    // 3) Atomic-ish: try to confirm first with a guard (prevents double-confirm race)
    const nowIso = new Date().toISOString();
    const { data: confirmData, error: confErr } = await supabaseAdmin
      .from("email_change_requests")
      .update({ confirmed_at: nowIso })
      .eq("id", reqRow.id)
      .is("confirmed_at", null)
      .select("id")
      .maybeSingle();

    // If someone else confirmed it between our read and update, treat as success (idempotent)
    if (confErr) {
      return jsonNoStore({ error: "Failed to confirm request" }, { status: 500 });
    }
    if (!confirmData?.id) {
      return jsonNoStore({ ok: true, success: true });
    }

    // 4) Update email on users table
    const { error: updErr } = await supabaseAdmin
      .from("users")
      .update({ email: newEmail })
      .eq("id", reqRow.user_id);

    if (updErr) {
      // Roll back confirmation marker so the link isn't "dead" if the user email update failed
      try {
        await supabaseAdmin
          .from("email_change_requests")
          .update({ confirmed_at: null })
          .eq("id", reqRow.id);
      } catch {}
      return jsonNoStore({ error: "Failed to update email" }, { status: 500 });
    }

    // 5) Security: invalidate all sessions so user must log in again
    try {
      await supabaseAdmin.from("sessions").delete().eq("user_id", reqRow.user_id);
    } catch {}

    return jsonNoStore({ ok: true, success: true });
  } catch (err) {
    console.error("CONFIRM EMAIL CHANGE ERROR:", err);
    return jsonNoStore({ error: "Server error while confirming" }, { status: 500 });
  }
}