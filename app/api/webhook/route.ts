import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Stripe uses default stable API version
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY!;
const PRICE_YEARLY = process.env.STRIPE_PRICE_YEARLY!;

const supabaseServer = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);

function jsonNoStore(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function getPlanType(stripePriceId?: string | null) {
  if (!stripePriceId) return null;
  if (stripePriceId === PRICE_MONTHLY) return "monthly";
  if (stripePriceId === PRICE_YEARLY) return "yearly";
  return null;
}

function isActiveStatus(status?: Stripe.Subscription.Status | null) {
  return status === "active" || status === "trialing";
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return jsonNoStore(
      { error: "Missing STRIPE_WEBHOOK_SECRET" },
      { status: 500 }
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return jsonNoStore({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err: any) {
    console.error("❌ WEBHOOK SIGNING ERROR:", err?.message || err);
    return jsonNoStore(
      { error: err?.message ?? "Invalid signature" },
      { status: 400 }
    );
  }

  try {
    // -------------------------------------------------
    // checkout.session.completed (upgrade flow)
    // -------------------------------------------------
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      const userId = (session.metadata as any)?.userId as string | undefined;
      if (!userId) {
        console.error("❌ Missing userId in checkout session metadata");
        return jsonNoStore({ received: true });
      }

      const subscriptionId = (session.subscription as string | null) ?? null;
      const customerId = (session.customer as string | null) ?? null;

      // Determine plan type from line items (safe + explicit)
      let stripePriceId: string | null = null;
      try {
        const lineItems = await stripe.checkout.sessions.listLineItems(
          session.id,
          { limit: 1 }
        );
        stripePriceId = lineItems.data?.[0]?.price?.id ?? null;
      } catch (e) {
        // If this fails, proceed; webhook may be retried
        console.error("⚠️ Failed to list line items:", e);
      }

      const plan_type = getPlanType(stripePriceId);

      await supabaseServer.from("profiles").upsert({
        id: userId,
        is_pro: true,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        plan_type,
      });

      console.log("✅ User upgraded:", userId);
    }

    // -------------------------------------------------
    // customer.subscription.created (portal/direct creation)
    // -------------------------------------------------
    if (event.type === "customer.subscription.created") {
      const sub = event.data.object as Stripe.Subscription;

      const customerId = (sub.customer as string | null) ?? null;
      const subscriptionId = sub.id;
      const stripePriceId = sub.items.data?.[0]?.price?.id ?? null;

      const plan_type = getPlanType(stripePriceId);

      const { data: profile } = await supabaseServer
        .from("profiles")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .single();

      if (!profile) return jsonNoStore({ received: true });

      await supabaseServer
        .from("profiles")
        .update({
          is_pro: isActiveStatus(sub.status),
          stripe_subscription_id: subscriptionId,
          plan_type,
        })
        .eq("id", profile.id);

      console.log("✅ Subscription created:", profile.id);
    }

    // -------------------------------------------------
    // customer.subscription.updated (switch monthly ↔ yearly, status changes)
    // -------------------------------------------------
    if (event.type === "customer.subscription.updated") {
      const sub = event.data.object as Stripe.Subscription;

      const customerId = (sub.customer as string | null) ?? null;
      const subscriptionId = sub.id;
      const stripePriceId = sub.items.data?.[0]?.price?.id ?? null;

      const plan_type = getPlanType(stripePriceId);

      const { data: profile } = await supabaseServer
        .from("profiles")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .single();

      if (!profile) return jsonNoStore({ received: true });

      await supabaseServer
        .from("profiles")
        .update({
          is_pro: isActiveStatus(sub.status),
          stripe_subscription_id: subscriptionId,
          plan_type,
        })
        .eq("id", profile.id);

      console.log("🔄 Subscription updated:", profile.id);
    }

    // -------------------------------------------------
    // customer.subscription.deleted (canceled)
    // -------------------------------------------------
    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;

      const customerId = (sub.customer as string | null) ?? null;

      const { data: profile } = await supabaseServer
        .from("profiles")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .single();

      if (!profile) return jsonNoStore({ received: true });

      await supabaseServer
        .from("profiles")
        .update({
          is_pro: false,
          plan_type: null,
          stripe_subscription_id: null,
        })
        .eq("id", profile.id);

      console.log("❌ Subscription canceled:", profile.id);
    }

    // Always return 200 for successfully processed events
    return jsonNoStore({ received: true });
  } catch (err: any) {
    console.error("❌ WEBHOOK HANDLER ERROR:", err?.message || err);
    // Webhooks should generally return 200 so Stripe doesn’t endlessly retry
    return jsonNoStore({ received: true });
  }
}