import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { sha256Hex } from "@/lib/security/crypto";

export const runtime = "nodejs";

function jsonNoStore(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

type ConfirmType = "signup" | "email-verify" | "email-change" | "newsletter";

type ConfirmBody = {
  token?: unknown;
  type?: unknown;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function parseType(raw: unknown): ConfirmType | null {
  if (raw === "signup") return "signup";
  if (raw === "email-verify") return "email-verify";
  if (raw === "email-change") return "email-change";
  if (raw === "newsletter") return "newsletter";
  return null;
}

type Purpose = "signup_verify" | "email_verify" | "email_change" | "newsletter_confirm";

/**
 * Atomically consume an auth token (single-use).
 * Returns token row if consumed; otherwise null.
 */
async function consumeAuthToken(params: { token: string; purpose: Purpose }) {
  const { token, purpose } = params;

  const tokenHash = sha256Hex(token);
  const nowIso = new Date().toISOString();

  const { data: tok, error } = await supabaseAdmin
    .from("auth_tokens")
    .update({ consumed_at: nowIso })
    .eq("token_hash", tokenHash)
    .eq("purpose", purpose)
    .is("consumed_at", null)
    .gt("expires_at", nowIso)
    .select("id,user_id,email,data,expires_at,consumed_at,purpose")
    .maybeSingle();

  if (error) {
    console.error("CONFIRM: consume token failed", { purpose, error });
    throw new Error("TOKEN_CONSUME_FAILED");
  }

  return tok ?? null;
}

async function bestEffortAudit(event: string, meta: any, userId?: string | null, req?: Request) {
  try {
    const cfIp = req?.headers.get("cf-connecting-ip");
    const forwardedFor = req?.headers.get("x-forwarded-for");
    const ip = (cfIp ?? forwardedFor)?.split(",")[0]?.trim() ?? null;
    const ua = req?.headers.get("user-agent") ?? null;

    await supabaseAdmin.from("audit_log").insert({
      user_id: userId ?? null,
      event,
      ip,
      user_agent: ua,
      meta: meta ?? {},
    });
  } catch {
    // ignore
  }
}

async function confirmEmailVerify(token: string, req: Request) {
  // You previously had both signup_verify and email_verify in your CHECK constraint.
  // If you've truly merged them, pick ONE and delete the other from the constraint.
  // For safety/compat, we try email_verify first, then signup_verify.
  const tok =
    (await consumeAuthToken({ token, purpose: "email_verify" }).catch(() => null)) ||
    (await consumeAuthToken({ token, purpose: "signup_verify" }).catch(() => null));

  if (!tok?.user_id) return null;

  const userId = tok.user_id as string;
  const nowIso = new Date().toISOString();

  // Idempotent: set verified if missing
  const { data: user, error: userErr } = await supabaseAdmin
    .from("users")
    .select("id,email,email_verified_at")
    .eq("id", userId)
    .maybeSingle();

  if (userErr || !user?.id) {
    console.error("CONFIRM email-verify: user lookup failed", userErr);
    throw new Error("USER_LOOKUP_FAILED");
  }

  if (!user.email_verified_at) {
    const { error: updErr } = await supabaseAdmin
      .from("users")
      .update({ email_verified_at: nowIso })
      .eq("id", userId);

    if (updErr) {
      console.error("CONFIRM email-verify: update failed", updErr);
      throw new Error("USER_VERIFY_UPDATE_FAILED");
    }
  }

  await bestEffortAudit(
    "EMAIL_VERIFIED",
    { email: user.email, purpose: tok.purpose },
    userId,
    req
  );

  return { ok: true, success: true, type: "signup" as const, email: user.email };
}

async function confirmEmailChange(token: string, req: Request) {
  const tok = await consumeAuthToken({ token, purpose: "email_change" }).catch(() => null);
  if (!tok?.user_id) return null;

  const userId = tok.user_id as string;
  const nowIso = new Date().toISOString();

  const newEmailRaw =
    (tok.data && typeof tok.data === "object" ? (tok.data as any).new_email : null) ??
    (tok.data && typeof tok.data === "object" ? (tok.data as any).newEmail : null) ??
    tok.email ??
    null;

  const newEmail = normalizeEmail(String(newEmailRaw || ""));
  if (!newEmail) {
    console.error("CONFIRM email-change: missing new_email in token data");
    throw new Error("EMAIL_CHANGE_BAD_TOKEN_DATA");
  }

  // Ensure not used by a different user (defensive; your unique index should also protect this)
  const { data: existing, error: existErr } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("email", newEmail)
    .maybeSingle();

  if (existErr) {
    console.error("CONFIRM email-change: existing email check failed", existErr);
    throw new Error("EMAIL_CHANGE_EXIST_CHECK_FAILED");
  }
  if (existing && existing.id !== userId) {
    return { ok: false, error: "Unable to use that email address." };
  }

  const { error: updErr } = await supabaseAdmin
    .from("users")
    .update({ email: newEmail })
    .eq("id", userId);

  if (updErr) {
    console.error("CONFIRM email-change: update users failed", updErr);
    // Token is already consumed; safest is to ask user to request again.
    throw new Error("EMAIL_CHANGE_UPDATE_FAILED");
  }

  // Security: revoke sessions (prefer revoke_at over delete for auditability)
  try {
    await supabaseAdmin
      .from("sessions")
      .update({ revoked_at: nowIso })
      .eq("user_id", userId)
      .is("revoked_at", null);
  } catch {}

  await bestEffortAudit(
    "EMAIL_CHANGE_COMPLETED",
    { new_email: newEmail },
    userId,
    req
  );

  return { ok: true, success: true, type: "email-change" as const };
}

async function confirmNewsletter(token: string, req: Request) {
  const tok = await consumeAuthToken({ token, purpose: "newsletter_confirm" }).catch(() => null);
  if (!tok?.email) return null;

  const email = normalizeEmail(String(tok.email || ""));
  if (!email) return null;

  const nowIso = new Date().toISOString();

  // Upsert subscriber (idempotent)
  const { error: upsertErr } = await supabaseAdmin.from("newsletter_subscribers").upsert(
    {
      email,
      confirmed: true,
      confirmed_at: nowIso,
      // if your table still has confirm_token_hash lingering, keep clearing it
      confirm_token_hash: null,
    },
    { onConflict: "email" }
  );

  if (upsertErr) {
    console.error("CONFIRM newsletter: upsert failed", upsertErr);
    throw new Error("NEWSLETTER_UPSERT_FAILED");
  }

  await bestEffortAudit("NEWSLETTER_CONFIRMED", { email }, null, req);

  return { ok: true, success: true, type: "newsletter" as const, email };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as ConfirmBody;

    const token = body?.token;
    if (typeof token !== "string" || !token) {
      return jsonNoStore({ error: "Missing token" }, { status: 400 });
    }

    const type = parseType(body?.type);

    // Back-compat: "signup" is email verification
    const normalizedType: ConfirmType | null = type === "signup" ? "email-verify" : type;

    if (normalizedType === "email-verify") {
      const out = await confirmEmailVerify(token, req);
      return out ? jsonNoStore(out) : jsonNoStore({ error: "Invalid token" }, { status: 400 });
    }

    if (normalizedType === "email-change") {
      const out = await confirmEmailChange(token, req);
      if (!out) return jsonNoStore({ error: "Invalid token" }, { status: 400 });
      if ((out as any).ok === false) return jsonNoStore(out, { status: 400 });
      return jsonNoStore(out);
    }

    if (normalizedType === "newsletter") {
      const out = await confirmNewsletter(token, req);
      return out ? jsonNoStore(out) : jsonNoStore({ error: "Invalid token" }, { status: 400 });
    }

    // If type missing/unknown: try all in a safe order
    const out =
      (await confirmEmailVerify(token, req).catch(() => null)) ||
      (await confirmEmailChange(token, req).catch(() => null)) ||
      (await confirmNewsletter(token, req).catch(() => null));

    if (!out) return jsonNoStore({ error: "Invalid token" }, { status: 400 });
    if ((out as any).ok === false) return jsonNoStore(out, { status: 400 });
    return jsonNoStore(out);
  } catch (err) {
    console.error("CONFIRM ERROR:", err);
    return jsonNoStore({ error: "Server error" }, { status: 500 });
  }
}