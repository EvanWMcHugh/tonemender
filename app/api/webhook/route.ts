import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// No API version here — Stripe uses default stable version
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY!;
const PRICE_YEARLY = process.env.STRIPE_PRICE_YEARLY!;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature")!;
  const secret = process.env.STRIPE_WEBHOOK_SECRET!;

  let event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err: any) {
    console.error("❌ WEBHOOK SIGNING ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  // -------------------------------------------------
  // HANDLE EVENT TYPES
  // -------------------------------------------------
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as any;

    const userId = session.metadata?.userId;
    if (!userId) {
      console.error("❌ Missing userId in metadata");
      return NextResponse.json({ received: true });
    }

    const subscriptionId = session.subscription;
    const customerId = session.customer;
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
const stripePriceId = lineItems.data[0]?.price?.id;

const plan_type =
  stripePriceId === PRICE_MONTHLY ? "monthly" :
  stripePriceId === PRICE_YEARLY ? "yearly" :
  null;
    // Store in profiles
    await supabase
      .from("profiles")
      .upsert({
        id: userId,
        is_pro: true,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        plan_type,
      });

    console.log("✅ User upgraded:", userId);
  }

  // -------------------------------------------------
  // Subscription created (e.g. direct from Customer Portal)
  // -------------------------------------------------
  if (event.type === "customer.subscription.created") {
    const sub = event.data.object as any;

    const customerId = sub.customer;
    const subscriptionId = sub.id;
    const stripePriceId = sub.items.data[0]?.price?.id;

const plan_type =
  stripePriceId === PRICE_MONTHLY ? "monthly" :
  stripePriceId === PRICE_YEARLY ? "yearly" :
  null;

    // Look up user from profiles
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
  // Subscription updated (switch monthly ↔ yearly)
  // -------------------------------------------------
  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object as any;

    const customerId = sub.customer;
    const subscriptionId = sub.id;
    const stripePriceId = sub.items.data[0]?.price?.id;

const plan_type =
  stripePriceId === PRICE_MONTHLY ? "monthly" :
  stripePriceId === PRICE_YEARLY ? "yearly" :
  null;

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
  // Subscription canceled (but still active until period end)
  // -------------------------------------------------
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as any;
    const customerId = sub.customer;

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
}