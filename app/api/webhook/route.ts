import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

// Stripe uses default stable API version
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY!;
const PRICE_YEARLY = process.env.STRIPE_PRICE_YEARLY!;

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

async function findUserIdByCustomerId(customerId: string | null) {
  if (!customerId) return null;

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (error || !data?.id) return null;
  return data.id as string;
}

async function upsertUserBilling(params: {
  userId: string;
  isPro: boolean;
  planType: string | null;
  customerId: string | null;
  subscriptionId: string | null;
}) {
  const { userId, isPro, planType, customerId, subscriptionId } = params;

  await supabaseAdmin
    .from("users")
    .update({
      is_pro: isPro,
      plan_type: planType,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
    })
    .eq("id", userId);
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return jsonNoStore({ error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });
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
    return jsonNoStore({ error: err?.message ?? "Invalid signature" }, { status: 400 });
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
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
        stripePriceId = lineItems.data?.[0]?.price?.id ?? null;
      } catch (e) {
        console.error("⚠️ Failed to list line items:", e);
      }

      const planType = getPlanType(stripePriceId);

      await upsertUserBilling({
        userId,
        isPro: true,
        planType,
        customerId,
        subscriptionId,
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
      const planType = getPlanType(stripePriceId);

      const userId = await findUserIdByCustomerId(customerId);
      if (!userId) return jsonNoStore({ received: true });

      await upsertUserBilling({
        userId,
        isPro: isActiveStatus(sub.status),
        planType,
        customerId,
        subscriptionId,
      });

      console.log("✅ Subscription created:", userId);
    }

    // -------------------------------------------------
    // customer.subscription.updated (switch monthly ↔ yearly, status changes)
    // -------------------------------------------------
    if (event.type === "customer.subscription.updated") {
      const sub = event.data.object as Stripe.Subscription;

      const customerId = (sub.customer as string | null) ?? null;
      const subscriptionId = sub.id;
      const stripePriceId = sub.items.data?.[0]?.price?.id ?? null;
      const planType = getPlanType(stripePriceId);

      const userId = await findUserIdByCustomerId(customerId);
      if (!userId) return jsonNoStore({ received: true });

      await upsertUserBilling({
        userId,
        isPro: isActiveStatus(sub.status),
        planType,
        customerId,
        subscriptionId,
      });

      console.log("🔄 Subscription updated:", userId);
    }

    // -------------------------------------------------
    // customer.subscription.deleted (canceled)
    // -------------------------------------------------
    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;

      const customerId = (sub.customer as string | null) ?? null;
      const userId = await findUserIdByCustomerId(customerId);
      if (!userId) return jsonNoStore({ received: true });

      await supabaseAdmin
        .from("users")
        .update({
          is_pro: false,
          plan_type: null,
          stripe_subscription_id: null,
        })
        .eq("id", userId);

      console.log("❌ Subscription canceled:", userId);
    }

    return jsonNoStore({ received: true });
  } catch (err: any) {
    console.error("❌ WEBHOOK HANDLER ERROR:", err?.message || err);
    // You chose to return 200 to avoid endless retries; keep that behavior
    return jsonNoStore({ received: true });
  }
}