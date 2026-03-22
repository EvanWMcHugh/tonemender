import { badRequest, forbidden, jsonNoStore, serverError } from "@/lib/api/responses";
import { getClientIp, getClientPlatform, getUserAgent } from "@/lib/request/client-meta";
import {
  consumeAppAttestChallenge,
  verifyAndStoreAttestation,
} from "@/lib/security/app-attest";

export const runtime = "nodejs";

type AttestBody = {
  keyId?: unknown;
  attestation?: unknown;
  challenge?: unknown;
};

export async function POST(req: Request) {
  try {
    let body: AttestBody = {};

    try {
      body = (await req.json()) as AttestBody;
    } catch {
      return badRequest("Invalid request body");
    }

    const keyId = typeof body.keyId === "string" ? body.keyId.trim() : "";
    const attestation =
      typeof body.attestation === "string" ? body.attestation.trim() : "";
    const challenge =
      typeof body.challenge === "string" ? body.challenge.trim() : "";

    if (!keyId) {
      return badRequest("Missing keyId");
    }

    if (!attestation) {
      return badRequest("Missing attestation");
    }

    if (!challenge) {
      return badRequest("Missing challenge");
    }

    if (getClientPlatform(req) !== "ios") {
      return forbidden("Invalid client platform");
    }

    const challengeResult = await consumeAppAttestChallenge({
      challengeBase64: challenge,
      purpose: "attest",
    });

    if (!challengeResult.ok) {
      return forbidden("Invalid challenge");
    }

    await verifyAndStoreAttestation({
      keyId,
      attestationBase64: attestation,
      challengeBase64: challenge,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    return jsonNoStore({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("APP_ATTEST_ATTEST_ERROR", { message });

    return serverError("Server error");
  }
}