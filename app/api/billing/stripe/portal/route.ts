import Stripe from "stripe";

import {
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

    const appUrl = process.env.APP_URL;

    if (!appUrl) {
      console.error("STRIPE_PORTAL_MISSING_APP_URL");
      return serverError("Server misconfigured");
    }

    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("email,stripe_customer_id,disabled_at,deleted_at")
      .eq("id", authUser.id)
      .maybeSingle();

    if (userError || !user) {
      return serverError("User lookup failed");
    }

    if (user.disabled_at || user.deleted_at) {
      return forbidden("Account unavailable");
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
        });

        try {
          await stripe.customers.del(customerId);
        } catch (cleanupError) {
          const message =
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError);

          console.error("STRIPE_PORTAL_CUSTOMER_CLEANUP_FAILED", {
            message,
          });
        }

        return serverError("Failed to initialize billing");
      }
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/account`,
    });

    if (!portal.url) {
      return jsonNoStore(
        { ok: false, error: "Failed to create billing portal session" },
        { status: 502 }
      );
    }

    await audit("STRIPE_PORTAL_CREATED", authUser.id, req, {
      customerId,
    });

    return jsonNoStore({
      ok: true,
      url: portal.url,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    console.error("STRIPE_PORTAL_ERROR", { message });

    return serverError("Server error while creating billing portal session");
  }
}