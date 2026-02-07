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

export async function POST(req: Request) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {}

    const token = body?.token;
    const typeRaw = body?.type;

    if (!token || typeof token !== "string") {
      return jsonNoStore({ error: "Missing token" }, { status: 400 });
    }

    const type: ConfirmType | null =
      typeRaw === "signup" || typeRaw === "newsletter" ? typeRaw : null;

    const tokenHash = sha256Hex(token);

    // ---------- SIGNUP CONFIRM ----------
    const handleSignup = async (): Promise<NextResponse | null> => {
      const { data: tok, error } = await supabaseAdmin
        .from("email_verification_tokens")
        .select("id, user_id, expires_at, consumed_at")
        .eq("token_hash", tokenHash)
        .single();

      if (error || !tok) return null;

      const expiresAt =
        typeof tok.expires_at === "string" ? Date.parse(tok.expires_at) : NaN;

      if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
        return jsonNoStore({ error: "Token expired", type: "signup" }, { status: 400 });
      }

      const { data: user } = await supabaseAdmin
        .from("users")
        .select("id, email, email_verified_at")
        .eq("id", tok.user_id)
        .single();

      if (!user) {
        return jsonNoStore({ error: "User not found", type: "signup" }, { status: 400 });
      }

      const now = new Date().toISOString();

      if (!user.email_verified_at) {
        await supabaseAdmin
          .from("users")
          .update({ email_verified_at: now })
          .eq("id", user.id);
      }

      await supabaseAdmin
        .from("email_verification_tokens")
        .update({ consumed_at: now })
        .eq("id", tok.id);

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

      if (data.confirmed) {
        return jsonNoStore({
          success: true,
          type: "newsletter",
          email: data.email,
        });
      }

      await supabaseAdmin
        .from("newsletter_subscribers")
        .update({
          confirmed: true,
          confirmed_at: new Date().toISOString(),
          confirm_token_hash: null,
        })
        .eq("id", data.id);

      return jsonNoStore({
        success: true,
        type: "newsletter",
        email: data.email,
      });
    };

    // ---------- DISPATCH ----------
    if (type === "signup") {
      return (await handleSignup()) ??
        jsonNoStore({ error: "Invalid token", type: "signup" }, { status: 400 });
    }

    if (type === "newsletter") {
      return (await handleNewsletter()) ??
        jsonNoStore({ error: "Invalid token", type: "newsletter" }, { status: 400 });
    }

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