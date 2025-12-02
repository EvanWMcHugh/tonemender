import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const { userId, email, plan } = await req.json();

    // You replace THESE:
    const MONTHLY_PRICE = "price_1SZiAFJEOSJcI2obrBnaFsAo";
    const YEARLY_PRICE = "price_1SZiAqJEOSJcI2obGRN9PSnn";

    const priceId = plan === "yearly" ? YEARLY_PRICE : MONTHLY_PRICE;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: email,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/success`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/cancel`,
      metadata: { userId },
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Checkout error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}