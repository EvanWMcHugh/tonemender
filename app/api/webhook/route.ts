import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Stripe client (NO apiVersion override)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Supabase admin client (server-only!)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export async function POST(req: Request) {
  const rawBody = await req.text(); // MUST be text, not JSON
  const signature = req.headers.get("stripe-signature")!;
  const secret = process.env.STRIPE_WEBHOOK_SECRET!;

  try {
    // Verify Stripe signature
    const event = stripe.webhooks.constructEvent(rawBody, signature, secret);

    // --- HANDLE CHECKOUT SUCCESS ---
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as any;

      const userId = session.metadata?.userId; // sent from checkout
      const stripeCustomerId = session.customer; // cus_xxxxx

      if (!userId) {
        console.error("❌ Webhook missing userId metadata");
        return NextResponse.json({ received: true });
      }

      // Update the user profile
      const { error } = await supabase
        .from("profiles")
        .update({
          is_pro: true,
          stripe_customer_id: stripeCustomerId,
        })
        .eq("id", userId);

      if (error) {
        console.error("❌ SUPABASE UPDATE ERROR", error);
      } else {
        console.log("✅ User upgraded to PRO:", userId);
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("❌ WEBHOOK ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}