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

async function getUserIdFromSession(req: Request) {
  const raw = readCookie(req, SESSION_COOKIE);
  if (!raw) return null;

  const hash = sha256Hex(raw);

  const { data: session, error } = await supabaseAdmin
    .from("sessions")
    .select("user_id,expires_at")
    .eq("session_token_hash", hash)
    .maybeSingle();

  if (error || !session) return null;

  const exp = new Date(session.expires_at).getTime();
  if (Number.isNaN(exp) || exp < Date.now()) {
    try {
      await supabaseAdmin.from("sessions").delete().eq("session_token_hash", hash);
    } catch {}
    return null;
  }

  return session.user_id as string;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const type = body?.type;

    const userId = await getUserIdFromSession(req);
    if (!userId) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    const planType = type === "yearly" ? "yearly" : "monthly";

    const PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY!;
    const PRICE_YEARLY = process.env.STRIPE_PRICE_YEARLY!;
    const priceId = planType === "yearly" ? PRICE_YEARLY : PRICE_MONTHLY;

    if (!priceId) {
      return jsonNoStore({ error: "Missing Stripe price ID" }, { status: 500 });
    }

    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      return jsonNoStore({ error: "Server misconfigured (missing APP_URL)" }, { status: 500 });
    }

    // ✅ Load user (custom users table)
    const { data: user, error: userErr } = await supabaseAdmin
      .from("users")
      .select("email,stripe_customer_id")
      .eq("id", userId)
      .maybeSingle();

    if (userErr || !user) {
      return jsonNoStore({ error: "User lookup failed" }, { status: 500 });
    }

    let customerId: string | null = user.stripe_customer_id ?? null;

    // Optional fallback if you still store stripe_customer_id in profiles (old supabase-auth world)
    if (!customerId) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", userId)
        .maybeSingle();

      customerId = profile?.stripe_customer_id ?? null;
    }

    // Create Stripe customer if needed
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { userId },
      });

      customerId = customer.id;

      // ✅ Preferred: store on users table (custom auth)
      const { error: updUserErr } = await supabaseAdmin
        .from("users")
        .update({ stripe_customer_id: customerId })
        .eq("id", userId);

      if (updUserErr) {
        // Fallback: try profiles if users table doesn't have this column yet
        try {
          await supabaseAdmin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", userId);
        } catch {}
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/account?success=true`,
      cancel_url: `${appUrl}/upgrade?canceled=true`,
      metadata: { userId, planType },
    });

    if (!session.url) {
      return jsonNoStore({ error: "Failed to create checkout session" }, { status: 502 });
    }

    return jsonNoStore({ url: session.url });
  } catch (err) {
    console.error("CHECKOUT ERROR:", err);
    return jsonNoStore({ error: "Server error while creating checkout session" }, { status: 500 });
  }
}