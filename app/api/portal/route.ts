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
    const token = getBearerToken(req) || tokenFromBody;

    if (!token || typeof token !== "string") {
      return jsonNoStore({ error: "Missing auth token" }, { status: 401 });
    }

    // Authenticate user
    const { data: authData, error: authError } =
      await supabaseServer.auth.getUser(token);

    if (authError || !authData?.user) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    const user = authData.user;

    // Get Stripe customer ID
    const { data: profile, error: profileError } = await supabaseServer
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (profileError) {
      return jsonNoStore({ error: "Profile lookup failed" }, { status: 500 });
    }

    if (!profile?.stripe_customer_id) {
      return jsonNoStore({ error: "No Stripe customer found" }, { status: 400 });
    }

    // ✅ Canonical app URL (server-side)
    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      return jsonNoStore(
        { error: "Server misconfigured (missing APP_URL)" },
        { status: 500 }
      );
    }

    // Create billing portal session
    const portal = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${appUrl}/account`,
    });

    if (!portal.url) {
      return jsonNoStore(
        { error: "Failed to create billing portal session" },
        { status: 502 }
      );
    }

    return jsonNoStore({ url: portal.url });
  } catch (err) {
    console.error("PORTAL ERROR:", err);
    return jsonNoStore(
      { error: "Server error while creating billing portal session" },
      { status: 500 }
    );
  }
}