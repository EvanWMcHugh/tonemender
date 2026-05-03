import {
  Environment,
  SignedDataVerifier,
} from "@apple/app-store-server-library";

import {
  badRequest,
  jsonNoStore,
  serverError,
  unauthorized,
} from "@/lib/api/responses";
import { getAuthUserFromRequest } from "@/lib/auth/server-auth";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { getClientIp, getUserAgent } from "@/lib/request/client-meta";

export const runtime = "nodejs";

const MONTHLY_PRODUCT_ID = "com.tonemender.pro.monthly.v4";
const YEARLY_PRODUCT_ID = "com.tonemender.pro.yearly.v4";

type SyncBody = {
  signedTransaction?: unknown;
};

function requireEnv(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return value.trim();
}

async function loadAppleRootCertificates(): Promise<Buffer[]> {
  const fs = await import("fs/promises");
  const path = await import("path");

  const certDir = path.join(process.cwd(), "certs");

  console.error("APPLE_CERT_DEBUG", {
    cwd: process.cwd(),
    certDir,
  });

  const files = [
    "AppleRootCA-G2.cer",
    "AppleRootCA-G3.cer",
    "AppleIncRootCertificate.cer",
  ];

  const buffers: Buffer[] = [];

  for (const file of files) {
    const fullPath = path.join(certDir, file);

    try {
      const data = await fs.readFile(fullPath);

      console.error("APPLE_CERT_FILE_FOUND", {
        file,
        fullPath,
        size: data.length,
      });

      buffers.push(data);
    } catch (error) {
      console.error("APPLE_CERT_FILE_MISSING", {
        file,
        fullPath,
      });
    }
  }

  if (buffers.length === 0) {
    throw new Error("No Apple root certificates found on server.");
  }

  return buffers;
}

function getAppleEnvironment(envRaw: string): Environment {
  const normalized = envRaw.trim().toLowerCase();

  if (normalized === "production") {
    return Environment.PRODUCTION;
  }

  if (normalized === "sandbox") {
    return Environment.SANDBOX;
  }

  throw new Error("APPLE_IAP_ENVIRONMENT must be either production or sandbox.");
}

async function makeVerifier(): Promise<SignedDataVerifier> {
  const bundleId = requireEnv("APPLE_BUNDLE_ID", process.env.APPLE_BUNDLE_ID);
  const envRaw = requireEnv(
    "APPLE_IAP_ENVIRONMENT",
    process.env.APPLE_IAP_ENVIRONMENT
  );

  const environment = getAppleEnvironment(envRaw);
  const roots = await loadAppleRootCertificates();

  let appAppleId: number | undefined;

if (environment === Environment.PRODUCTION) {
  const parsedAppAppleId = Number.parseInt(
    requireEnv("APPLE_APP_STORE_ID", process.env.APPLE_APP_STORE_ID),
    10
  );

  if (!Number.isInteger(parsedAppAppleId) || parsedAppAppleId <= 0) {
    throw new Error("APPLE_APP_STORE_ID must be a valid App Store numeric ID.");
  }

  appAppleId = parsedAppAppleId;
}

return new SignedDataVerifier(
  roots,
  true,
  environment,
  bundleId,
  appAppleId
);
}

function resolvePlanType(
  productId?: string | null
): "monthly" | "yearly" | null {
  if (productId === MONTHLY_PRODUCT_ID) return "monthly";
  if (productId === YEARLY_PRODUCT_ID) return "yearly";
  return null;
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUserFromRequest(req);

    if (!authUser?.id) {
      return unauthorized("Unauthorized");
    }

    let body: SyncBody = {};

    try {
      body = (await req.json()) as SyncBody;
    } catch {
      return badRequest("Invalid request body");
    }

    const signedTransaction =
      typeof body.signedTransaction === "string"
        ? body.signedTransaction.trim()
        : "";

    if (!signedTransaction) {
      return badRequest("Missing signedTransaction");
    }

    const verifier = await makeVerifier();
    const decoded = await verifier.verifyAndDecodeTransaction(signedTransaction);

    const productId =
      typeof decoded.productId === "string" ? decoded.productId : null;

    const transactionId =
      decoded.transactionId != null ? String(decoded.transactionId) : null;

    const originalTransactionId =
      decoded.originalTransactionId != null
        ? String(decoded.originalTransactionId)
        : null;

    const purchaseDate =
      decoded.purchaseDate != null
        ? new Date(Number(decoded.purchaseDate)).toISOString()
        : null;

    const expiresDate =
      decoded.expiresDate != null
        ? new Date(Number(decoded.expiresDate)).toISOString()
        : null;

    const revocationDate =
      decoded.revocationDate != null
        ? new Date(Number(decoded.revocationDate)).toISOString()
        : null;

    const planType = resolvePlanType(productId);

    if (!productId || !planType) {
      return badRequest("Unknown subscription product.");
    }

    if (!transactionId) {
      return badRequest("Missing Apple transaction ID.");
    }

    const active =
      !revocationDate &&
      !!expiresDate &&
      new Date(expiresDate).getTime() > Date.now();

    const { error: upsertError } = await supabaseAdmin
      .from("ios_subscription_transactions")
      .upsert(
        {
          user_id: authUser.id,
          product_id: productId,
          plan_type: planType,
          transaction_id: transactionId,
          original_transaction_id: originalTransactionId,
          purchase_date: purchaseDate,
          expires_date: expiresDate,
          revocation_date: revocationDate,
          signed_transaction_jws: signedTransaction,
          raw_payload: decoded,
          last_seen_at: new Date().toISOString(),
          ip: getClientIp(req),
          user_agent: getUserAgent(req),
        },
        { onConflict: "transaction_id" }
      );

    if (upsertError) {
      console.error("APPLE_SYNC_TRANSACTION_UPSERT_FAILED", {
        message: upsertError.message,
      });
      return serverError("Failed to save transaction");
    }

    const { error: userUpdateError } = await supabaseAdmin
      .from("users")
      .update({
        is_pro: active,
        plan_type: active ? planType : null,
      })
      .eq("id", authUser.id);

    if (userUpdateError) {
      console.error("APPLE_SYNC_USER_UPDATE_FAILED", {
        message: userUpdateError.message,
      });
      return serverError("Failed to update user plan");
    }

    return jsonNoStore({
      ok: true,
      is_pro: active,
      plan_type: active ? planType : null,
      product_id: productId,
      transaction_id: transactionId,
      expires_date: expiresDate,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("APPLE_SYNC_ERROR", { message });

    return serverError("Billing sync failed");
  }
}