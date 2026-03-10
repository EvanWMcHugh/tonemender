import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth/server-auth";
import {
  getGooglePlayPackageName,
  getGooglePlaySubscription,
} from "@/lib/billing/google-play";

export const runtime = "nodejs";

const PRODUCT_ID = "tonemender_pro";
const MONTHLY_BASE_PLAN_ID = "monthly";
const YEARLY_BASE_PLAN_ID = "yearly";

function jsonNoStore(data: unknown, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

type VerifyBody = {
  purchaseToken?: unknown;
  productId?: unknown;
  basePlanId?: unknown;
};

function normalizePlanType(basePlanId: string) {
  if (basePlanId === MONTHLY_BASE_PLAN_ID) return "monthly";
  if (basePlanId === YEARLY_BASE_PLAN_ID) return "yearly";
  return null;
}

function isActiveSubscriptionState(state?: string | null) {
  return (
    state === "SUBSCRIPTION_STATE_ACTIVE" ||
    state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"
  );
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.id) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as VerifyBody;

    const purchaseToken =
      typeof body.purchaseToken === "string" ? body.purchaseToken.trim() : "";
    const productId =
      typeof body.productId === "string" ? body.productId.trim() : "";
    const basePlanId =
      typeof body.basePlanId === "string" ? body.basePlanId.trim() : "";

    if (!purchaseToken) {
      return jsonNoStore({ error: "Missing purchaseToken" }, { status: 400 });
    }

    if (!productId) {
      return jsonNoStore({ error: "Missing productId" }, { status: 400 });
    }

    if (!basePlanId) {
      return jsonNoStore({ error: "Missing basePlanId" }, { status: 400 });
    }

    if (productId !== PRODUCT_ID) {
      return jsonNoStore({ error: "Invalid productId" }, { status: 400 });
    }

    const planType = normalizePlanType(basePlanId);
    if (!planType) {
      return jsonNoStore({ error: "Invalid basePlanId" }, { status: 400 });
    }

    const packageName = getGooglePlayPackageName();

    const sub = await getGooglePlaySubscription({
      packageName,
      purchaseToken,
    });

    const subscriptionState =
      typeof sub?.subscriptionState === "string" ? sub.subscriptionState : null;

    const lineItems = Array.isArray(sub?.lineItems) ? sub.lineItems : [];

    const matchingLineItem = lineItems.find((item: any) => {
      return (
        item?.productId === PRODUCT_ID &&
        item?.offerDetails?.basePlanId === basePlanId
      );
    });

    if (!matchingLineItem) {
      return jsonNoStore(
        { error: "Purchase does not match requested product/base plan" },
        { status: 400 }
      );
    }

    if (!isActiveSubscriptionState(subscriptionState)) {
      return jsonNoStore(
        {
          error: "Subscription is not active",
          subscriptionState,
        },
        { status: 400 }
      );
    }

    const { error: updateErr } = await supabaseAdmin
      .from("users")
      .update({
        is_pro: true,
        plan_type: planType,
        updated_at: new Date().toISOString(),
      })
      .eq("id", authUser.id);

    if (updateErr) {
      console.error("GOOGLE VERIFY: user update error:", updateErr);
      return jsonNoStore({ error: "Failed to update user" }, { status: 500 });
    }

    return jsonNoStore({
      success: true,
      message: "Purchase verified",
      planType,
      subscriptionState,
      expiryTime: matchingLineItem?.expiryTime ?? null,
    });
  } catch (e: any) {
    console.error("GOOGLE VERIFY ERROR:", e);
    return jsonNoStore({ error: "Server error" }, { status: 500 });
  }
}