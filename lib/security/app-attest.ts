import crypto from "crypto";
import { supabaseAdmin } from "@/lib/db/supabase-admin";

type VerifyIosAppAttestAssertionArgs = {
  keyId: string;
  assertion: string;
  challenge: string;
  requestHash: string;
};

type VerifyIosAppAttestAssertionResult = {
  ok: boolean;
  reason: string;
  publicMessage: string;
  payload?: any;
};

const APPLE_APP_ID = `${process.env.APPLE_TEAM_ID}.${process.env.APPLE_BUNDLE_ID}`;

function sha256Hex(input: string | Buffer) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function randomChallengeBase64(size = 32) {
  return crypto.randomBytes(size).toString("base64");
}

export async function createAppAttestChallenge(params: {
  purpose: "attest" | "assertion";
  keyId?: string | null;
  requestHash?: string | null;
}) {
  const challenge = randomChallengeBase64(32);
  const challengeHash = sha256Hex(Buffer.from(challenge, "base64"));
  const expiresAt = new Date(Date.now() + 1000 * 60 * 5).toISOString();

  const { error } = await supabaseAdmin.from("app_attest_challenges").insert({
    challenge_hash: challengeHash,
    purpose: params.purpose,
    key_id: params.keyId ?? null,
    request_hash: params.requestHash ?? null,
    expires_at: expiresAt,
  });

  if (error) {
    throw new Error("Failed to create App Attest challenge");
  }

  return { challenge };
}

export async function consumeAppAttestChallenge(params: {
  challengeBase64: string;
  purpose: "attest" | "assertion";
  keyId?: string | null;
  requestHash?: string | null;
}) {
  const challengeHash = sha256Hex(Buffer.from(params.challengeBase64, "base64"));

  const { data: row, error } = await supabaseAdmin
    .from("app_attest_challenges")
    .select("*")
    .eq("challenge_hash", challengeHash)
    .eq("purpose", params.purpose)
    .is("consumed_at", null)
    .maybeSingle();

  if (error || !row) {
    return { ok: false as const, reason: "challenge_not_found" };
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false as const, reason: "challenge_expired" };
  }

  if (params.keyId && row.key_id && row.key_id !== params.keyId) {
    return { ok: false as const, reason: "challenge_key_mismatch" };
  }

  if (params.requestHash && row.request_hash && row.request_hash !== params.requestHash) {
    return { ok: false as const, reason: "challenge_request_hash_mismatch" };
  }

  await supabaseAdmin
    .from("app_attest_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id);

  return { ok: true as const, row };
}

export async function storeAttestedKey(params: {
  keyId: string;
  ip: string | null;
  userAgent: string | null;
}) {
  const { error } = await supabaseAdmin.from("app_attest_keys").upsert({
    key_id: params.keyId,
    app_id: APPLE_APP_ID,
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    last_seen_at: new Date().toISOString(),
    last_ip: params.ip,
    last_user_agent: params.userAgent,
  });

  if (error) {
    throw new Error("Failed to store attested key");
  }
}

export async function verifyIosAppAttestAssertion({
  keyId,
  assertion,
  challenge,
  requestHash,
}: VerifyIosAppAttestAssertionArgs): Promise<VerifyIosAppAttestAssertionResult> {
  const challengeResult = await consumeAppAttestChallenge({
    challengeBase64: challenge,
    purpose: "assertion",
    keyId,
    requestHash,
  });

  if (!challengeResult.ok) {
    return {
      ok: false,
      reason: challengeResult.reason,
      publicMessage: "Integrity verification failed.",
    };
  }

  const { data: keyRow, error } = await supabaseAdmin
    .from("app_attest_keys")
    .select("*")
    .eq("key_id", keyId)
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !keyRow) {
    return {
      ok: false,
      reason: "unknown_key",
      publicMessage: "Integrity verification failed.",
    };
  }

  // Placeholder until full Apple cryptographic assertion verification is added.
  if (!assertion) {
    return {
      ok: false,
      reason: "missing_assertion",
      publicMessage: "Integrity verification failed.",
    };
  }

  return {
    ok: true,
    reason: "placeholder_verified",
    publicMessage: "ok",
    payload: { keyId },
  };
}