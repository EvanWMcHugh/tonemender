import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sha256Hex } from "@/lib/security";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const SESSION_COOKIE = "tm_session";

function jsonNoStore(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function readCookie(req: Request, name: string) {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function getClientIp(req: Request) {
  const cfIp = req.headers.get("cf-connecting-ip");
  const forwardedFor = req.headers.get("x-forwarded-for");
  return (cfIp ?? forwardedFor)?.split(",")[0]?.trim() ?? null;
}

function getUserAgent(req: Request) {
  return req.headers.get("user-agent") ?? null;
}

async function audit(event: string, userId: string | null, req: Request, meta: Record<string, any> = {}) {
  try {
    await supabaseAdmin.from("audit_log").insert({
      user_id: userId,
      event,
      ip: getClientIp(req),
      user_agent: getUserAgent(req),
      meta,
    });
  } catch {}
}

async function getUserIdFromSession(req: Request) {
  const raw = readCookie(req, SESSION_COOKIE);
  if (!raw) return null;

  const hash = sha256Hex(raw);
  const nowIso = new Date().toISOString();

  const { data: session, error } = await supabaseAdmin
    .from("sessions")
    .select("user_id,expires_at,revoked_at")
    .eq("session_token_hash", hash)
    .maybeSingle();

  if (error || !session?.user_id) return null;
  if (session.revoked_at) return null;
  if (!session.expires_at || session.expires_at <= nowIso) return null;

  // Best-effort last_seen_at
  try {
    await supabaseAdmin
      .from("sessions")
      .update({ last_seen_at: nowIso })
      .eq("session_token_hash", hash)
      .is("revoked_at", null);
  } catch {}

  return String(session.user_id);
}

export async function POST(req: Request) {
  try {
    const userId = await getUserIdFromSession(req);
    if (!userId) return jsonNoStore({ error: "Unauthorized" }, { status: 401 });

    const appUrl = process.env.APP_URL;
    if (!appUrl) return jsonNoStore({ error: "Server misconfigured (missing APP_URL)" }, { status: 500 });

    // Load user
    const { data: user, error: userErr } = await supabaseAdmin
      .from("users")
      .select("email,stripe_customer_id,disabled_at,deleted_at")
      .eq("id", userId)
      .maybeSingle();

    if (userErr || !user) return jsonNoStore({ error: "User lookup failed" }, { status: 500 });
    if (user.disabled_at || user.deleted_at) return jsonNoStore({ error: "Account unavailable" }, { status: 403 });

    let customerId: string | null = user.stripe_customer_id ?? null;

    // ✅ Optional improvement: create Stripe customer automatically if missing
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { userId },
      });

      customerId = customer.id;

      const { error: updErr } = await supabaseAdmin
        .from("users")
        .update({ stripe_customer_id: customerId })
        .eq("id", userId);

      if (updErr) {
        await audit("STRIPE_CUSTOMER_SAVE_FAILED", userId, req, {});
        return jsonNoStore({ error: "Failed to initialize billing" }, { status: 500 });
      }
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/account`,
    });

    if (!portal.url) return jsonNoStore({ error: "Failed to create billing portal session" }, { status: 502 });

    await audit("STRIPE_PORTAL_CREATED", userId, req, {});
    return jsonNoStore({ url: portal.url });
  } catch (err) {
    console.error("PORTAL ERROR:", err);
    return jsonNoStore({ error: "Server error while creating billing portal session" }, { status: 500 });
  }
}