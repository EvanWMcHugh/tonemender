import Stripe from "stripe";

import {
  badRequest,
  forbidden,
  jsonNoStore,
  serverError,
  unauthorized,
} from "@/lib/api/responses";
import { getAuthUserFromRequest } from "@/lib/auth/server-auth";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { getClientIp, getUserAgent } from "@/lib/request/client-meta";

export const runtime = "nodejs";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  throw new Error("Missing STRIPE_SECRET_KEY");
}

const stripe = new Stripe(stripeSecretKey);

type CheckoutBody = {
  type?: unknown;
};

function parsePlanType(value: unknown): "monthly" | "yearly" | null {
  if (value === "monthly" || value === "yearly") return value;
  return null;
}

async function audit(
  event: string,
  userId: string | null,
  req: Request,
  meta: Record<string, unknown> = {}
): Promise<void> {
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
      return unauthorized("Unauthorized");
    }

    let body: CheckoutBody = {};

    try {
      body = (await req.json()) as CheckoutBody;
    } catch {
      return badRequest("Invalid request body");
    }

    const planType = parsePlanType(body.type);

    if (!planType) {
      return badRequest("Invalid plan type");
    }

    const priceMonthly = process.env.STRIPE_PRICE_MONTHLY;
    const priceYearly = process.env.STRIPE_PRICE_YEARLY;
    const priceId = planType === "yearly" ? priceYearly : priceMonthly;

    if (!priceId) {
      return serverError("Missing Stripe price ID");
    }

    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      return serverError("Server misconfigured");
    }

    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("email,stripe_customer_id,disabled_at,deleted_at,is_pro,plan_type")
      .eq("id", authUser.id)
      .maybeSingle();

    if (userError || !user) {
      return serverError("User lookup failed");
    }

    if (user.disabled_at || user.deleted_at) {
      return forbidden("Account unavailable");
    }

    if (user.is_pro) {
      return jsonNoStore({ ok: false, error: "Already subscribed" }, { status: 409 });
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

      const { error: updateError } = await supabaseAdmin
        .from("users")
        .update({ stripe_customer_id: customerId })
        .eq("id", authUser.id);

      if (updateError) {
        await audit("STRIPE_CUSTOMER_SAVE_FAILED", authUser.id, req, {
          createdCustomerId,
          planType,
        });

        try {
          await stripe.customers.del(customerId);
        } catch (cleanupError) {
          const message =
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError);

          console.error("STRIPE_CHECKOUT_CUSTOMER_CLEANUP_FAILED", { message });
        }

        return serverError("Failed to initialize billing");
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: authUser.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/account?success=true`,
      cancel_url: `${appUrl}/upgrade?canceled=true`,
      metadata: {
        userId: authUser.id,
        planType,
      },
    });

    if (!session.url) {
      return jsonNoStore(
        { ok: false, error: "Failed to create checkout session" },
        { status: 502 }
      );
    }

    await audit("STRIPE_CHECKOUT_CREATED", authUser.id, req, {
      planType,
      customerId,
    });

    return jsonNoStore({
      ok: true,
      url: session.url,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    console.error("STRIPE_CHECKOUT_ERROR", { message });

    return serverError("Server error while creating checkout session");
  }
}