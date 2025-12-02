import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// ✅ Next.js 13/14 Route Segment Config
export const runtime = "edge";              // required for raw body
export const dynamic = "force-dynamic";     // prevents caching

// ❗ Stripe requires RAW request body.
// Next.js automatically keeps req.text() raw inside edge runtime.

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature")!;
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  try {
    // 🔥 Construct Stripe Event
    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      endpointSecret
    );

    // 🔥 Handle successful subscription
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as any;
      const userId = session.metadata.userId; // MUST match your checkout metadata

      await supabase
        .from("profiles")
        .update({ is_pro: true })
        .eq("id", userId);
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("Webhook error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}