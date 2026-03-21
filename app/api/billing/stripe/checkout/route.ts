import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth/server-auth";

export const runtime = "nodejs";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  throw new Error("Missing STRIPE_SECRET_KEY");
}

const stripe = new Stripe(stripeSecretKey);

type CheckoutBody = {
  type?: unknown;
};

function jsonNoStore(data: unknown, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function getClientIp(req: Request) {
  const cfIp = req.headers.get("cf-connecting-ip");
  const forwardedFor = req.headers.get("x-forwarded-for");
  return (cfIp ?? forwardedFor)?.split(",")[0]?.trim() ?? null;
}

function getUserAgent(req: Request) {
  return req.headers.get("user-agent") ?? null;
}

async function audit(
  event: string,
  userId: string | null,
  req: Request,
  meta: Record<string, unknown> = {}
) {
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

function parsePlanType(value: unknown): "monthly" | "yearly" | null {
  if (value === "monthly" || value === "yearly") return value;
  return null;
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.id) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    let body: CheckoutBody = {};
    try {
      body = (await req.json()) as CheckoutBody;
    } catch {
      return jsonNoStore({ error: "Invalid request body" }, { status: 400 });
    }

    const planType = parsePlanType(body.type);
    if (!planType) {
      return jsonNoStore({ error: "Invalid plan type" }, { status: 400 });
    }

    const PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY;
    const PRICE_YEARLY = process.env.STRIPE_PRICE_YEARLY;
    const priceId = planType === "yearly" ? PRICE_YEARLY : PRICE_MONTHLY;

    if (!priceId) {
      return jsonNoStore({ error: "Missing Stripe price ID" }, { status: 500 });
    }

    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      return jsonNoStore({ error: "Server misconfigured" }, { status: 500 });
    }

    const { data: user, error: userErr } = await supabaseAdmin
      .from("users")
      .select("email,stripe_customer_id,disabled_at,deleted_at,is_pro,plan_type")
      .eq("id", authUser.id)
      .maybeSingle();

    if (userErr || !user) {
      return jsonNoStore({ error: "User lookup failed" }, { status: 500 });
    }

    if (user.disabled_at || user.deleted_at) {
      return jsonNoStore({ error: "Account unavailable" }, { status: 403 });
    }

    if (user.is_pro) {
      return jsonNoStore({ error: "Already subscribed" }, { status: 409 });
    }

    let customerId: string | null = user.stripe_customer_id ?? null;
    let createdCustomerId: string | null = null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { userId: authUser.id },
      });

      customerId = customer.id;
      createdCustomerId = customer.id;

      const { error: updErr } = await supabaseAdmin
        .from("users")
        .update({ stripe_customer_id: customerId })
        .eq("id", authUser.id);

      if (updErr) {
        await audit("STRIPE_CUSTOMER_SAVE_FAILED", authUser.id, req, {
          createdCustomerId,
          planType,
        });

        try {
          await stripe.customers.del(customerId);
        } catch (cleanupErr) {
          console.error("CHECKOUT customer cleanup failed:", cleanupErr);
        }

        return jsonNoStore({ error: "Failed to initialize billing" }, { status: 500 });
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: authUser.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/account?success=true`,
      cancel_url: `${appUrl}/upgrade?canceled=true`,
      metadata: { userId: authUser.id, planType },
    });

    if (!session.url) {
      return jsonNoStore({ error: "Failed to create checkout session" }, { status: 502 });
    }

    await audit("STRIPE_CHECKOUT_CREATED", authUser.id, req, {
      planType,
      customerId,
    });

    return jsonNoStore({ url: session.url });
  } catch (err) {
    console.error("CHECKOUT ERROR:", err);
    return jsonNoStore({ error: "Server error while creating checkout session" }, { status: 500 });
  }
}