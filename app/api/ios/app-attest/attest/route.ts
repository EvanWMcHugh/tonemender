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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const keyId = body?.keyId;
    const attestation = body?.attestation;
    const challenge = body?.challenge;

    if (!keyId || typeof keyId !== "string") {
      return jsonNoStore({ error: "Missing keyId" }, { status: 400 });
    }

    if (!attestation || typeof attestation !== "string") {
      return jsonNoStore({ error: "Missing attestation" }, { status: 400 });
    }

    if (!challenge || typeof challenge !== "string") {
      return jsonNoStore({ error: "Missing challenge" }, { status: 400 });
    }

    const challengeResult = await consumeAppAttestChallenge({
      challengeBase64: challenge,
      purpose: "attest",
    });

    if (!challengeResult.ok) {
      return jsonNoStore({ error: "Invalid challenge" }, { status: 403 });
    }

    // Placeholder until full Apple cryptographic attestation verification is added.
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