import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const config = {
  api: {
    bodyParser: false,
  },
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature")!;
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  try {
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      endpointSecret
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as any;
      const userId = session.metadata.user_id;

      // Mark user as pro in database
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