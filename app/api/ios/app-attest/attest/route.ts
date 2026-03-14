import { NextResponse } from "next/server";
import {
  consumeAppAttestChallenge,
  storeAttestedKey,
} from "@/lib/security/app-attest";

export const runtime = "nodejs";

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

function getPlatform(req: Request) {
  return req.headers.get("x-client-platform") ?? null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const keyId = typeof body?.keyId === "string" ? body.keyId.trim() : "";
    const attestation =
      typeof body?.attestation === "string" ? body.attestation.trim() : "";
    const challenge =
      typeof body?.challenge === "string" ? body.challenge.trim() : "";

    if (!keyId) {
      return jsonNoStore({ error: "Missing keyId" }, { status: 400 });
    }

    if (!attestation) {
      return jsonNoStore({ error: "Missing attestation" }, { status: 400 });
    }

    if (!challenge) {
      return jsonNoStore({ error: "Missing challenge" }, { status: 400 });
    }

    const platform = getPlatform(req);
    if (platform !== "ios") {
      return jsonNoStore({ error: "Invalid client platform" }, { status: 403 });
    }

    const challengeResult = await consumeAppAttestChallenge({
      challengeBase64: challenge,
      purpose: "attest",
    });

    if (!challengeResult.ok) {
      return jsonNoStore({ error: "Invalid challenge" }, { status: 403 });
    }

    // TODO: Add full Apple App Attest cryptographic verification here.
    // For now, this stores the key after validating challenge consumption.

    await storeAttestedKey({
      keyId,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    return jsonNoStore({ ok: true });
  } catch {
    return jsonNoStore({ error: "Server error" }, { status: 500 });
  }
}