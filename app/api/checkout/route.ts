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

  // Best-effort last_seen_at update
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
    const body = await req.json().catch(() => ({}));
    const type = body?.type;

    const userId = await getUserIdFromSession(req);
    if (!userId) return jsonNoStore({ error: "Unauthorized" }, { status: 401 });

    const planType = type === "yearly" ? "yearly" : "monthly";

    const PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY!;
    const PRICE_YEARLY = process.env.STRIPE_PRICE_YEARLY!;
    const priceId = planType === "yearly" ? PRICE_YEARLY : PRICE_MONTHLY;

    if (!priceId) return jsonNoStore({ error: "Missing Stripe price ID" }, { status: 500 });

    const appUrl = process.env.APP_URL;
    if (!appUrl) return jsonNoStore({ error: "Server misconfigured (missing APP_URL)" }, { status: 500 });

    // Load user
    const { data: user, error: userErr } = await supabaseAdmin
      .from("users")
      .select("email,stripe_customer_id,disabled_at,deleted_at,is_pro,plan_type")
      .eq("id", userId)
      .maybeSingle();

    if (userErr || !user) return jsonNoStore({ error: "User lookup failed" }, { status: 500 });
    if (user.disabled_at || user.deleted_at) return jsonNoStore({ error: "Account unavailable" }, { status: 403 });

    // Optional: if already pro, send them to portal instead of checkout
    // (You already have /api/portal for this)
    if (user.is_pro) {
      return jsonNoStore({ error: "Already subscribed" }, { status: 409 });
    }

    let customerId: string | null = user.stripe_customer_id ?? null;

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

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/account?success=true`,
      cancel_url: `${appUrl}/upgrade?canceled=true`,
      metadata: { userId, planType },
      // Optional: collect tax or billing address based on your business needs
      // billing_address_collection: "auto",
    });

    if (!session.url) return jsonNoStore({ error: "Failed to create checkout session" }, { status: 502 });

    await audit("STRIPE_CHECKOUT_CREATED", userId, req, { planType });
    return jsonNoStore({ url: session.url });
  } catch (err) {
    console.error("CHECKOUT ERROR:", err);
    return jsonNoStore({ error: "Server error while creating checkout session" }, { status: 500 });
  }
}