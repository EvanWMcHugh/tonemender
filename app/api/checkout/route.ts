import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Server-side Supabase client (service role key required)
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

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const t = authHeader.slice(7).trim();
    return t.length ? t : null;
  }
  return null;
}

export async function POST(req: Request) {
  try {
    // Parse body safely
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const tokenFromBody = body?.token;
    const type = body?.type;

    const token = getBearerToken(req) || tokenFromBody;

    if (!token || typeof token !== "string") {
      return jsonNoStore({ error: "Missing auth token" }, { status: 401 });
    }

    // Authenticate user
    const { data: authData, error: authError } = await supabaseServer.auth.getUser(token);

    if (authError || !authData?.user) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    const user = authData.user;
    const userId = user.id;

    // Validate plan type
    const planType = type === "yearly" ? "yearly" : "monthly";

    // Choose correct price ID
    const PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY!;
    const PRICE_YEARLY = process.env.STRIPE_PRICE_YEARLY!;
    const priceId = planType === "yearly" ? PRICE_YEARLY : PRICE_MONTHLY;

    if (!priceId) {
      return jsonNoStore({ error: "Missing Stripe price ID" }, { status: 500 });
    }

    // ✅ Canonical app URL (server-side)
    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      return jsonNoStore(
        { error: "Server misconfigured (missing APP_URL)" },
        { status: 500 }
      );
    }

    // Fetch existing Stripe customer id
    const { data: profile, error: profileError } = await supabaseServer
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .single();

    if (profileError) {
      return jsonNoStore({ error: "Profile lookup failed" }, { status: 500 });
    }

    let customerId: string | null = profile?.stripe_customer_id ?? null;

    // Create Stripe customer if needed
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { userId },
      });

      customerId = customer.id;

      const { error: updateError } = await supabaseServer
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", userId);

      if (updateError) {
        // Customer exists now in Stripe; fail safely so you can retry without duplicates later
        return jsonNoStore(
          { error: "Failed to store Stripe customer ID" },
          { status: 500 }
        );
      }
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/account?success=true`,
      cancel_url: `${appUrl}/upgrade?canceled=true`,
      metadata: {
        userId,
        planType,
      },
    });

    if (!session.url) {
      return jsonNoStore(
        { error: "Failed to create checkout session" },
        { status: 502 }
      );
    }

    return jsonNoStore({ url: session.url });
  } catch (err) {
    console.error("CHECKOUT ERROR:", err);
    return jsonNoStore(
      { error: "Server error while creating checkout session" },
      { status: 500 }
    );
  }
}