import { NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/db/supabase-admin";

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

async function audit(userId: string | null, event: string, meta: Record<string, any> = {}) {
  try {
    await supabaseAdmin.from("audit_log").insert({ user_id: userId, event, meta });
  } catch {}
}

function asId(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object" && "id" in (v as any) && typeof (v as any).id === "string") return (v as any).id;
  return null;
}

async function findUserIdByCustomerId(customerId: string | null) {
  if (!customerId) return null;

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (error || !data?.id) return null;
  return String(data.id);
}

async function upsertUserBilling(params: {
  userId: string;
  isPro: boolean;
  planType: string | null;
  customerId: string | null;
  subscriptionId: string | null;
}) {
  const { userId, isPro, planType, customerId, subscriptionId } = params;

  const { error } = await supabaseAdmin
    .from("users")
    .update({
      is_pro: isPro,
      plan_type: planType,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
    })
    .eq("id", userId);

  if (error) throw error;
}

/**
 * Idempotency: store Stripe event IDs you've processed.
 * Table: stripe_events(id text primary key, type text, created_at timestamptz default now())
 */
async function markEventProcessedOnce(event: Stripe.Event) {
  const { error } = await supabaseAdmin.from("stripe_events").insert({
    id: event.id,
    type: event.type,
  });

  // Unique violation => already processed
  if (error && (error as any).code === "23505") return false;
  if (error) throw error;

  return true;
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return jsonNoStore({ error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return jsonNoStore({ error: "Missing stripe-signature" }, { status: 400 });

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err: any) {
    console.error("❌ WEBHOOK SIGNING ERROR:", err?.message || err);
    return jsonNoStore({ error: err?.message ?? "Invalid signature" }, { status: 400 });
  }

  try {
    // ---- idempotency guard (Stripe retries) ----
    const shouldProcess = await markEventProcessedOnce(event);
    if (!shouldProcess) return jsonNoStore({ received: true });

    // -------------------------------------------------
    // checkout.session.completed
    // Save customer/sub IDs early (status truth comes from subscription events)
    // -------------------------------------------------
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      const userId = (session.metadata as any)?.userId as string | undefined;
      const subscriptionId = asId(session.subscription);
      const customerId = asId(session.customer);

      if (!userId) {
        await audit(null, "STRIPE_CHECKOUT_MISSING_USERID", { eventId: event.id });
        return jsonNoStore({ received: true });
      }

      // Best-effort: store IDs; do not force is_pro here.
      try {
        await supabaseAdmin
          .from("users")
          .update({
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
          })
          .eq("id", userId);
      } catch {}

      await audit(userId, "STRIPE_CHECKOUT_COMPLETED", {
        eventId: event.id,
        customerId,
        subscriptionId,
      });
    }

    // Helper for subscription-driven truth updates
    const handleSubscription = async (sub: Stripe.Subscription, kind: string) => {
      const customerId = asId(sub.customer);
      const subscriptionId = sub.id;

      const stripePriceId = sub.items.data?.[0]?.price?.id ?? null;
      const planType = getPlanType(stripePriceId);

      const userId = await findUserIdByCustomerId(customerId);
      if (!userId) {
        await audit(null, "STRIPE_SUB_NO_USER", { kind, eventId: event.id, customerId });
        return;
      }

      await upsertUserBilling({
        userId,
        isPro: isActiveStatus(sub.status),
        planType,
        customerId,
        subscriptionId,
      });

      await audit(userId, kind, {
        eventId: event.id,
        customerId,
        subscriptionId,
        status: sub.status,
        stripePriceId,
        planType,
      });
    };

    // -------------------------------------------------
    // customer.subscription.created / updated / deleted
    // -------------------------------------------------
    if (event.type === "customer.subscription.created") {
      const sub = event.data.object as Stripe.Subscription;
      await handleSubscription(sub, "STRIPE_SUB_CREATED");
    }

    if (event.type === "customer.subscription.updated") {
      const sub = event.data.object as Stripe.Subscription;
      await handleSubscription(sub, "STRIPE_SUB_UPDATED");
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = asId(sub.customer);

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

      await audit(userId, "STRIPE_SUB_DELETED", {
        eventId: event.id,
        customerId,
        subscriptionId: sub.id,
      });
    }

    // -------------------------------------------------
    // invoice.paid / invoice.payment_failed (recommended)
    // NOTE: Your Stripe typings say invoice.subscription doesn't exist.
    // We safely read it via (invoice as any).subscription to avoid TS errors.
    // -------------------------------------------------
    if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;

      const customerId = asId(invoice.customer);
      const userId = await findUserIdByCustomerId(customerId);
      if (!userId) return jsonNoStore({ received: true });

      // ✅ Avoid TS error: property doesn't exist in your installed typings
      const subscriptionId = asId((invoice as any).subscription);

      if (subscriptionId) {
        try {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          await handleSubscription(sub, event.type === "invoice.paid" ? "STRIPE_INVOICE_PAID" : "STRIPE_INVOICE_FAILED");
        } catch {
          await audit(userId, "STRIPE_INVOICE_SUB_RETRIEVE_FAILED", {
            eventId: event.id,
            customerId,
            subscriptionId,
            type: event.type,
          });
        }
      } else {
        await audit(userId, "STRIPE_INVOICE_NO_SUB", {
          eventId: event.id,
          customerId,
          type: event.type,
        });
      }
    }

    return jsonNoStore({ received: true });
  } catch (err: any) {
    console.error("❌ WEBHOOK HANDLER ERROR:", err?.message || err);
    // Keep 200 to avoid infinite retries (your choice)
    return jsonNoStore({ received: true });
  }
}