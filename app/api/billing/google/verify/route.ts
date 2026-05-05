import {
  badRequest,
  jsonNoStore,
  serverError,
  unauthorized,
} from "@/lib/api/responses";
import { getAuthUserFromRequest } from "@/lib/auth/server-auth";
import {
  getGooglePlayPackageName,
  getGooglePlaySubscription,
} from "@/lib/billing/google-play";
import { supabaseAdmin } from "@/lib/db/supabase-admin";

export const runtime = "nodejs";

const PRODUCT_ID = "tonemender_pro";
const MONTHLY_BASE_PLAN_ID = "monthly";
const YEARLY_BASE_PLAN_ID = "yearly";

type VerifyBody = {
  purchaseToken?: unknown;
  productId?: unknown;
  basePlanId?: unknown;
};

type GoogleLineItem = {
  productId?: string;
  expiryTime?: string | null;
  offerDetails?: {
    basePlanId?: string;
  } | null;
};

type GoogleSubscriptionResponse = {
  subscriptionState?: string | null;
  lineItems?: GoogleLineItem[] | null;
};

function normalizePlanType(
  basePlanId: string
): "monthly" | "yearly" | null {
  if (basePlanId === MONTHLY_BASE_PLAN_ID) return "monthly";
  if (basePlanId === YEARLY_BASE_PLAN_ID) return "yearly";
  return null;
}

function isActiveSubscriptionState(state?: string | null): boolean {
  return (
    state === "SUBSCRIPTION_STATE_ACTIVE" ||
    state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"
  );
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUserFromRequest(req);

    if (!authUser?.id) {
      return unauthorized("Unauthorized");
    }

    let body: VerifyBody = {};

    try {
      body = (await req.json()) as VerifyBody;
    } catch {
      return badRequest("Invalid request body");
    }

    const purchaseToken =
      typeof body.purchaseToken === "string" ? body.purchaseToken.trim() : "";
    const productId =
      typeof body.productId === "string" ? body.productId.trim() : "";
    const basePlanId =
      typeof body.basePlanId === "string" ? body.basePlanId.trim() : "";

    if (!purchaseToken) {
      return badRequest("Missing purchaseToken");
    }

    if (!productId) {
      return badRequest("Missing productId");
    }

    if (!basePlanId) {
      return badRequest("Missing basePlanId");
    }

    if (productId !== PRODUCT_ID) {
      return badRequest("Invalid productId");
    }

    const planType = normalizePlanType(basePlanId);

    if (!planType) {
      return badRequest("Invalid basePlanId");
    }

    const packageName = getGooglePlayPackageName();

    const subscription = (await getGooglePlaySubscription({
      packageName,
      purchaseToken,
    })) as GoogleSubscriptionResponse;

    const subscriptionState =
      typeof subscription?.subscriptionState === "string"
        ? subscription.subscriptionState
        : null;

    const lineItems = Array.isArray(subscription?.lineItems)
      ? subscription.lineItems
      : [];

    const matchingLineItem = lineItems.find((item) => {
      return (
        item?.productId === PRODUCT_ID &&
        item?.offerDetails?.basePlanId === basePlanId
      );
    });

    if (!matchingLineItem) {
      return badRequest("Purchase does not match requested product/base plan");
    }

    if (!isActiveSubscriptionState(subscriptionState)) {
      return jsonNoStore(
        {
          ok: false,
          error: "Subscription is not active",
          subscriptionState,
        },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({
        is_pro: true,
        plan_type: planType,
        updated_at: new Date().toISOString(),
        // google_purchase_token: purchaseToken,
        // google_product_id: productId,
        // google_base_plan_id: basePlanId,
      })
      .eq("id", authUser.id);

    if (updateError) {
      console.error("GOOGLE_VERIFY_USER_UPDATE_FAILED", {
        message: updateError.message,
      });
      return serverError("Failed to update user");
    }

    await supabaseAdmin.from("google_subscription_purchases").upsert(
      {
        user_id: authUser.id,
        purchase_token: purchaseToken,
        product_id: productId,
        base_plan_id: basePlanId,
        plan_type: planType,
        subscription_state: subscriptionState,
        expiry_time: matchingLineItem.expiryTime ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "purchase_token" }
    );

    await supabaseAdmin.from("billing_audit").insert({
      user_id: authUser.id,
      provider: "google",
      event: "GOOGLE_PURCHASE_VERIFIED",
      meta: {
        productId,
        basePlanId,
        planType,
        subscriptionState,
        expiryTime: matchingLineItem.expiryTime ?? null,
      },
    });

    await supabaseAdmin.from("audit_log").insert({
      user_id: authUser.id,
      event: "GOOGLE_PURCHASE_VERIFIED",
      meta: {
        productId,
        basePlanId,
        planType,
      },
    });

    return jsonNoStore({
      ok: true,
      message: "Purchase verified",
      planType,
      subscriptionState,
      expiryTime: matchingLineItem.expiryTime ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("GOOGLE_VERIFY_ERROR", { message });

    return serverError("Server error");
  }
}