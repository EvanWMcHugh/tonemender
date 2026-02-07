// app/api/confirm/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sha256Hex } from "@/lib/security";

export const runtime = "nodejs";

function jsonNoStore(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

type ConfirmType = "signup" | "newsletter";

type ConfirmBody = {
  token?: unknown;
  type?: unknown;
};

export async function POST(req: Request) {
  try {
    let body: ConfirmBody = {};
    try {
      body = (await req.json()) as ConfirmBody;
    } catch {
      // ignore invalid JSON, will fail validation below
    }

    const token = body?.token;
    const typeRaw = body?.type;

    if (typeof token !== "string" || !token) {
      return jsonNoStore({ error: "Missing token" }, { status: 400 });
    }

    const type: ConfirmType | null =
      typeRaw === "signup" || typeRaw === "newsletter" ? typeRaw : null;

    const tokenHash = sha256Hex(token);

    // ---------- SIGNUP CONFIRM ----------
    const handleSignup = async (): Promise<NextResponse | null> => {
      // ✅ Enforce single-use tokens by requiring consumed_at IS NULL
      const { data: tok, error } = await supabaseAdmin
        .from("email_verification_tokens")
        .select("id, user_id, expires_at")
        .eq("token_hash", tokenHash)
        .is("consumed_at", null)
        .single();

      if (error || !tok) return null;

      const expiresAt =
        typeof tok.expires_at === "string" ? Date.parse(tok.expires_at) : NaN;

      if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
        return jsonNoStore(
          { error: "Token expired", type: "signup" },
          { status: 400 }
        );
      }

      const { data: user, error: userErr } = await supabaseAdmin
        .from("users")
        .select("id, email, email_verified_at")
        .eq("id", tok.user_id)
        .single();

      if (userErr || !user) {
        return jsonNoStore(
          { error: "User not found", type: "signup" },
          { status: 400 }
        );
      }

      const now = new Date().toISOString();

      // Idempotent: only set if missing
      if (!user.email_verified_at) {
        const { error: updErr } = await supabaseAdmin
          .from("users")
          .update({ email_verified_at: now })
          .eq("id", user.id);

        if (updErr) {
          console.error("CONFIRM signup: update users failed", updErr);
          return jsonNoStore({ error: "Server error" }, { status: 500 });
        }
      }

      // Consume token (single-use)
      const { error: consumeErr } = await supabaseAdmin
        .from("email_verification_tokens")
        .update({ consumed_at: now })
        .eq("id", tok.id);

      if (consumeErr) {
        console.error("CONFIRM signup: consume token failed", consumeErr);
        return jsonNoStore({ error: "Server error" }, { status: 500 });
      }

      return jsonNoStore({
        success: true,
        type: "signup",
        email: user.email,
      });
    };

    // ---------- NEWSLETTER CONFIRM ----------
    const handleNewsletter = async (): Promise<NextResponse | null> => {
      const { data, error } = await supabaseAdmin
        .from("newsletter_subscribers")
        .select("id, email, confirmed")
        .eq("confirm_token_hash", tokenHash)
        .single();

      if (error || !data) return null;

      // Idempotent success if already confirmed
      if (data.confirmed) {
        return jsonNoStore({
          success: true,
          type: "newsletter",
          email: data.email,
        });
      }

      const now = new Date().toISOString();

      const { error: updErr } = await supabaseAdmin
        .from("newsletter_subscribers")
        .update({
          confirmed: true,
          confirmed_at: now,
          confirm_token_hash: null,
        })
        .eq("id", data.id);

      if (updErr) {
        console.error("CONFIRM newsletter: update failed", updErr);
        return jsonNoStore({ error: "Server error" }, { status: 500 });
      }

      return jsonNoStore({
        success: true,
        type: "newsletter",
        email: data.email,
      });
    };

    // ---------- DISPATCH ----------
    if (type === "signup") {
      return (
        (await handleSignup()) ??
        jsonNoStore({ error: "Invalid token", type: "signup" }, { status: 400 })
      );
    }

    if (type === "newsletter") {
      return (
        (await handleNewsletter()) ??
        jsonNoStore(
          { error: "Invalid token", type: "newsletter" },
          { status: 400 }
        )
      );
    }

    // If type not provided, try both without revealing which one matched
    return (
      (await handleSignup()) ||
      (await handleNewsletter()) ||
      jsonNoStore({ error: "Invalid token" }, { status: 400 })
    );
  } catch (err) {
    console.error("CONFIRM ERROR:", err);
    return jsonNoStore({ error: "Server error" }, { status: 500 });
  }
}