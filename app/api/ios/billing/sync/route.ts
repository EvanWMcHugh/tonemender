import { NextResponse } from "next/server";
import {
  Environment,
  SignedDataVerifier,
} from "@apple/app-store-server-library";

import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { getAuthUserFromRequest } from "@/lib/auth/server-auth";

export const runtime = "nodejs";

const MONTHLY_PRODUCT_ID = "tonemender_pro_monthly";
const YEARLY_PRODUCT_ID = "tonemender_pro_yearly";

const bundleId = process.env.APPLE_BUNDLE_ID!;
const envRaw = process.env.APPLE_IAP_ENVIRONMENT ?? "Sandbox";
const appAppleIdRaw = process.env.APPLE_APPLE_ID;

const environment =
  envRaw.toLowerCase() === "production"
    ? Environment.PRODUCTION
    : Environment.SANDBOX;

function jsonNoStore(data: unknown, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

function getClientIp(req: Request) {
  const cfIp = req.headers.get("cf-connecting-ip");
  const forwardedFor = req.headers.get("x-forwarded-for");
  return (cfIp ?? forwardedFor)?.split(",")[0]?.trim() ?? null;
}

function getUserAgent(req: Request) {
  return req.headers.get("user-agent") ?? null;
}

function requireEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function loadAppleRootCertificates(): Promise<Buffer[]> {
  // Put these in /certs or another server-side-only location:
  // AppleRootCA-G2.cer
  // AppleRootCA-G3.cer
  // AppleIncRootCertificate.cer
  // AppleComputerRootCertificate.cer
  //
  // For now, keep this minimal. Add/remove roots based on what you download.
  const fs = await import("fs/promises");
  const path = await import("path");

  const certDir = path.join(process.cwd(), "certs");

  const files = [
    "AppleRootCA-G2.cer",
    "AppleRootCA-G3.cer",
    "AppleIncRootCertificate.cer",
    "AppleComputerRootCertificate.cer",
  ];

  const buffers: Buffer[] = [];

  for (const file of files) {
    try {
      const fullPath = path.join(certDir, file);
      const data = await fs.readFile(fullPath);
      buffers.push(data);
    } catch {
      // ignore missing optional cert files
    }
  }

  if (buffers.length === 0) {
    throw new Error("No Apple root certificates found on server.");
  }

  return buffers;
}

async function makeVerifier() {
  requireEnv("APPLE_BUNDLE_ID", bundleId);

  const roots = await loadAppleRootCertificates();

  const appAppleId =
    environment === Environment.PRODUCTION && appAppleIdRaw
      ? Number.parseInt(appAppleIdRaw, 10)
      : undefined;

  return new SignedDataVerifier(
    roots,
    true,
    environment,
    bundleId,
    appAppleId
  );
}

function resolvePlanType(productId?: string | null): "monthly" | "yearly" | null {
  if (productId === MONTHLY_PRODUCT_ID) return "monthly";
  if (productId === YEARLY_PRODUCT_ID) return "yearly";
  return null;
}

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUserFromRequest(req);

    if (!authUser?.id) {
      return jsonNoStore({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({} as any));
    const signedTransaction =
      typeof body?.signedTransaction === "string"
        ? body.signedTransaction.trim()
        : "";

    if (!signedTransaction) {
      return jsonNoStore({ error: "Missing signedTransaction" }, { status: 400 });
    }

    const verifier = await makeVerifier();
    const decoded = await verifier.verifyAndDecodeTransaction(signedTransaction);

    const productId = typeof decoded.productId === "string" ? decoded.productId : null;
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
      return jsonNoStore(
        { error: "Unknown subscription product.", productId },
        { status: 400 }
      );
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
      console.error("IOS BILLING SYNC UPSERT ERROR:", upsertError);
      return jsonNoStore({ error: "Failed to save transaction" }, { status: 500 });
    }

    const { error: userUpdateError } = await supabaseAdmin
      .from("users")
      .update({
        is_pro: active,
        plan_type: active ? planType : null,
      })
      .eq("id", authUser.id);

    if (userUpdateError) {
      console.error("IOS BILLING USER UPDATE ERROR:", userUpdateError);
      return jsonNoStore({ error: "Failed to update user plan" }, { status: 500 });
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
    console.error("IOS BILLING SYNC ERROR:", error);
    return jsonNoStore({ error: "Billing sync failed" }, { status: 500 });
  }
}