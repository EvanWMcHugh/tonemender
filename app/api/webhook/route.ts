import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// Stripe requires Node.js runtime
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stripe client
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  if (!signature) {
    return NextResponse.json(
      { error: "Missing Stripe signature header" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, endpointSecret);
  } catch (err: any) {
    console.error("❌ Stripe signature error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as any;
    const userId = session?.metadata?.userId;

    if (!userId) {
      return NextResponse.json(
        { error: "No userId found on checkout session" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("profiles")
      .update({ is_pro: true })
      .eq("id", userId);

    if (error) {
      console.error("❌ Supabase update error:", error);
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}