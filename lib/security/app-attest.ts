import crypto from "crypto";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
// Example package; install and type-check in your project.
// npm i node-app-attest
import { verifyAttestation, verifyAssertion } from "node-app-attest";

type VerifyIosAppAttestAssertionArgs = {
  keyId: string;
  assertion: string;
  challengeId: string;
  method: string;
  path: string;
  requestBody: Buffer;
};

type VerifyIosAppAttestAssertionResult = {
  ok: boolean;
  reason: string;
  publicMessage: string;
  payload?: Record<string, unknown>;
};

const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID ?? "";
const APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID ?? "";

function sha256Hex(input: string | Buffer) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function randomChallengeBase64(size = 32) {
  return crypto.randomBytes(size).toString("base64");
}

function normalizePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

function buildAssertionPayload(args: {
  challengeBase64: string;
  method: string;
  path: string;
  requestBody: Buffer;
}) {
  const challengeBytes = Buffer.from(args.challengeBase64, "base64");
  const methodBytes = Buffer.from(args.method.toUpperCase(), "utf8");
  const pathBytes = Buffer.from(normalizePath(args.path), "utf8");
  const separator = Buffer.from([0]);

  return Buffer.concat([
    challengeBytes,
    methodBytes,
    separator,
    pathBytes,
    separator,
    args.requestBody,
  ]);
}

function allowDevelopmentEnvironment() {
  return process.env.NODE_ENV !== "production";
}

export async function createAppAttestChallenge(params: {
  purpose: "attest" | "assertion";
  keyId?: string | null;
}) {
  const challenge = randomChallengeBase64(32);
  const challengeHash = sha256Hex(Buffer.from(challenge, "base64"));
  const expiresAt = new Date(Date.now() + 1000 * 60 * 5).toISOString();

  const { data, error } = await supabaseAdmin
    .from("app_attest_challenges")
    .insert({
      challenge,
      challenge_hash: challengeHash,
      purpose: params.purpose,
      key_id: params.keyId ?? null,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error("Failed to create App Attest challenge");
  }

  return {
    challengeId: String(data.id),
    challenge,
    expiresAt,
  };
}

export async function consumeAppAttestChallengeById(params: {
  challengeId: string;
  purpose: "attest" | "assertion";
  keyId?: string | null;
}) {
  const { data: row, error } = await supabaseAdmin
    .from("app_attest_challenges")
    .select("*")
    .eq("id", params.challengeId)
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

  const { error: updateError } = await supabaseAdmin
    .from("app_attest_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("consumed_at", null);

  if (updateError) {
    return { ok: false as const, reason: "challenge_consume_failed" };
  }

  return { ok: true as const, row };
}

export async function consumeAppAttestChallenge(params: {
  challengeBase64: string;
  purpose: "attest" | "assertion";
  keyId?: string | null;
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

  const { error: updateError } = await supabaseAdmin
    .from("app_attest_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("consumed_at", null);

  if (updateError) {
    return { ok: false as const, reason: "challenge_consume_failed" };
  }

  return { ok: true as const, row };
}

export async function verifyAndStoreAttestation(params: {
  keyId: string;
  attestationBase64: string;
  challengeBase64: string;
  ip: string | null;
  userAgent: string | null;
}) {
  const attestationBuffer = Buffer.from(params.attestationBase64, "base64");
  const challengeBuffer = Buffer.from(params.challengeBase64, "base64");

  const verified = await verifyAttestation({
    attestation: attestationBuffer,
    challenge: challengeBuffer,
    keyId: params.keyId,
    bundleIdentifier: APPLE_BUNDLE_ID,
    teamIdentifier: APPLE_TEAM_ID,
    allowDevelopmentEnvironment: allowDevelopmentEnvironment(),
  });

  const nowIso = new Date().toISOString();

  const { error } = await supabaseAdmin.from("app_attest_keys").upsert({
    key_id: params.keyId,
    app_id: `${APPLE_TEAM_ID}.${APPLE_BUNDLE_ID}`,
    environment: allowDevelopmentEnvironment() ? "development" : "production",
    public_key_pem: verified.publicKey,
    receipt: verified.receipt ?? null,
    last_seen_at: nowIso,
    last_ip: params.ip,
    last_user_agent: params.userAgent,
    revoked_at: null,
  });

  if (error) {
    throw new Error("Failed to store attested key");
  }

  return verified;
}

export async function verifyIosAppAttestAssertion({
  keyId,
  assertion,
  challengeId,
  method,
  path,
  requestBody,
}: VerifyIosAppAttestAssertionArgs): Promise<VerifyIosAppAttestAssertionResult> {
  const challengeResult = await consumeAppAttestChallengeById({
    challengeId,
    purpose: "assertion",
    keyId,
  });

  if (!challengeResult.ok) {
    return {
      ok: false,
      reason: challengeResult.reason,
      publicMessage: "Integrity verification failed.",
    };
  }

  const { row } = challengeResult;

  const { data: keyRow, error } = await supabaseAdmin
    .from("app_attest_keys")
    .select("key_id, public_key_pem, revoked_at")
    .eq("key_id", keyId)
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !keyRow?.public_key_pem) {
    return {
      ok: false,
      reason: "unknown_key",
      publicMessage: "Integrity verification failed.",
    };
  }

  if (!row.challenge || typeof row.challenge !== "string") {
    return {
      ok: false,
      reason: "missing_challenge_value",
      publicMessage: "Integrity verification failed.",
    };
  }

  const assertionPayload = buildAssertionPayload({
    challengeBase64: row.challenge,
    method,
    path,
    requestBody,
  });

  const clientDataHash = crypto.createHash("sha256").update(assertionPayload).digest();

  try {
    await verifyAssertion({
      assertion: Buffer.from(assertion, "base64"),
      publicKey: keyRow.public_key_pem,
      clientDataHash,
      bundleIdentifier: APPLE_BUNDLE_ID,
      teamIdentifier: APPLE_TEAM_ID,
      allowDevelopmentEnvironment: allowDevelopmentEnvironment(),
    });
  } catch {
    return {
      ok: false,
      reason: "assertion_invalid",
      publicMessage: "Integrity verification failed.",
    };
  }

  await supabaseAdmin
    .from("app_attest_keys")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("key_id", keyId);

  return {
    ok: true,
    reason: "verified",
    publicMessage: "ok",
  };
}