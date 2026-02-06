import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Stripe uses default stable API version
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY!;
const PRICE_YEARLY = process.env.STRIPE_PRICE_YEARLY!;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

function getPlanType(stripePriceId?: string | null) {
  if (!stripePriceId) return null;
  if (stripePriceId === PRICE_MONTHLY) return "monthly";
  if (stripePriceId === PRICE_YEARLY) return "yearly";
  return null;
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Missing STRIPE_WEBHOOK_SECRET" },
      { status: 500 }
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature" },
      { status: 400 }
    );
  }

  const rawBody = await req.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err: any) {
    console.error("❌ WEBHOOK SIGNING ERROR:", err?.message || err);
    return NextResponse.json(
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
        console.error("❌ Missing userId in metadata");
        return NextResponse.json({ received: true });
      }

      const subscriptionId = session.subscription as string | null;
      const customerId = session.customer as string | null;

      // Get priceId from line items
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
        limit: 1,
      });
      const stripePriceId = lineItems.data[0]?.price?.id ?? null;

      const plan_type = getPlanType(stripePriceId);

      await supabase.from("profiles").upsert({
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

      const customerId = sub.customer as string | null;
      const subscriptionId = sub.id;
      const stripePriceId = sub.items.data[0]?.price?.id ?? null;

      const plan_type = getPlanType(stripePriceId);

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .single();

      if (!profile) return NextResponse.json({ received: true });

      await supabase
        .from("profiles")
        .update({
          is_pro: true,
          stripe_subscription_id: subscriptionId,
          plan_type,
        })
        .eq("id", profile.id);

      console.log("✅ Subscription created:", profile.id);
    }

    // -------------------------------------------------
    // customer.subscription.updated (switch monthly ↔ yearly)
    // -------------------------------------------------
    if (event.type === "customer.subscription.updated") {
      const sub = event.data.object as Stripe.Subscription;

      const customerId = sub.customer as string | null;
      const subscriptionId = sub.id;
      const stripePriceId = sub.items.data[0]?.price?.id ?? null;

      const plan_type = getPlanType(stripePriceId);
      const status = sub.status;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .single();

      if (!profile) return NextResponse.json({ received: true });

      await supabase
        .from("profiles")
        .update({
          is_pro: status === "active" || status === "trialing",
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

      const customerId = sub.customer as string | null;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .single();

      if (!profile) return NextResponse.json({ received: true });

      await supabase
        .from("profiles")
        .update({
          is_pro: false,
          plan_type: null,
          stripe_subscription_id: null,
        })
        .eq("id", profile.id);

      console.log("❌ Subscription canceled:", profile.id);
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("❌ WEBHOOK HANDLER ERROR:", err?.message || err);
    // Webhooks should generally return 200 so Stripe doesn’t endlessly retry
    return NextResponse.json({ received: true });
  }
}