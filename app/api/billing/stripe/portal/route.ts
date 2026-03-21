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

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.id) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      console.error("PORTAL ERROR: missing APP_URL");
      return jsonNoStore({ error: "Server misconfigured" }, { status: 500 });
    }

    const { data: user, error: userErr } = await supabaseAdmin
      .from("users")
      .select("email,stripe_customer_id,disabled_at,deleted_at")
      .eq("id", authUser.id)
      .maybeSingle();

    if (userErr || !user) {
      return jsonNoStore({ error: "User lookup failed" }, { status: 500 });
    }

    if (user.disabled_at || user.deleted_at) {
      return jsonNoStore({ error: "Account unavailable" }, { status: 403 });
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
        });

        try {
          await stripe.customers.del(customerId);
        } catch (cleanupErr) {
          console.error("PORTAL customer cleanup failed:", cleanupErr);
        }

        return jsonNoStore({ error: "Failed to initialize billing" }, { status: 500 });
      }
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/account`,
    });

    if (!portal.url) {
      return jsonNoStore({ error: "Failed to create billing portal session" }, { status: 502 });
    }

    await audit("STRIPE_PORTAL_CREATED", authUser.id, req, {
      customerId,
    });

    return jsonNoStore({ url: portal.url });
  } catch (err) {
    console.error("PORTAL ERROR:", err);
    return jsonNoStore({ error: "Server error while creating billing portal session" }, { status: 500 });
  }
}