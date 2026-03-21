// lib/security/app-attest.ts
import "server-only";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/db/supabase-admin";
import { verifyAttestation, verifyAssertion } from "node-app-attest";

type AppAttestPurpose = "attest" | "assertion";

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

type AppAttestChallengeRow = {
  id: string;
  challenge: string;
  challenge_hash: string;
  purpose: AppAttestPurpose;
  key_id: string | null;
  expires_at: string;
  consumed_at: string | null;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const APPLE_TEAM_ID = getRequiredEnv("APPLE_TEAM_ID");
const APPLE_BUNDLE_ID = getRequiredEnv("APPLE_BUNDLE_ID");

function sha256Hex(input: string | Buffer): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function randomChallengeBase64(size = 32): string {
  return crypto.randomBytes(size).toString("base64");
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function allowDevelopmentEnvironment(): boolean {
  return process.env.APP_ATTEST_ALLOW_DEV === "true";
}

function buildAssertionPayload(args: {
  challengeBase64: string;
  method: string;
  path: string;
  requestBody: Buffer;
}): Buffer {
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

function isValidBase64(value: string): boolean {
  try {
    return Buffer.from(value, "base64").length > 0;
  } catch {
    return false;
  }
}

async function consumeChallengeRowAtomically(params: {
  row: AppAttestChallengeRow;
}): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("app_attest_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", params.row.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();

  return !error && !!data?.id;
}

export async function createAppAttestChallenge(params: {
  purpose: AppAttestPurpose;
  keyId?: string | null;
}): Promise<{
  challengeId: string;
  challenge: string;
  expiresAt: string;
}> {
  const challenge = randomChallengeBase64(32);
  const challengeHash = sha256Hex(Buffer.from(challenge, "base64"));
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

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

  if (error || !data?.id) {
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
  purpose: AppAttestPurpose;
  keyId?: string | null;
}): Promise<
  | { ok: true; row: AppAttestChallengeRow }
  | { ok: false; reason: string }
> {
  const { data: row, error } = await supabaseAdmin
    .from("app_attest_challenges")
    .select("id, challenge, challenge_hash, purpose, key_id, expires_at, consumed_at")
    .eq("id", params.challengeId)
    .eq("purpose", params.purpose)
    .is("consumed_at", null)
    .maybeSingle<AppAttestChallengeRow>();

  if (error || !row) {
    return { ok: false, reason: "challenge_not_found" };
  }

  if (!row.expires_at || new Date(row.expires_at).getTime() <= Date.now()) {
    return { ok: false, reason: "challenge_expired" };
  }

  if (params.keyId && row.key_id && row.key_id !== params.keyId) {
    return { ok: false, reason: "challenge_key_mismatch" };
  }

  const consumed = await consumeChallengeRowAtomically({ row });
  if (!consumed) {
    return { ok: false, reason: "challenge_consume_failed" };
  }

  return { ok: true, row };
}

export async function consumeAppAttestChallenge(params: {
  challengeBase64: string;
  purpose: AppAttestPurpose;
  keyId?: string | null;
}): Promise<
  | { ok: true; row: AppAttestChallengeRow }
  | { ok: false; reason: string }
> {
  if (!isValidBase64(params.challengeBase64)) {
    return { ok: false, reason: "challenge_invalid_base64" };
  }

  const challengeHash = sha256Hex(Buffer.from(params.challengeBase64, "base64"));

  const { data: row, error } = await supabaseAdmin
    .from("app_attest_challenges")
    .select("id, challenge, challenge_hash, purpose, key_id, expires_at, consumed_at")
    .eq("challenge_hash", challengeHash)
    .eq("purpose", params.purpose)
    .is("consumed_at", null)
    .maybeSingle<AppAttestChallengeRow>();

  if (error || !row) {
    return { ok: false, reason: "challenge_not_found" };
  }

  if (!row.expires_at || new Date(row.expires_at).getTime() <= Date.now()) {
    return { ok: false, reason: "challenge_expired" };
  }

  if (params.keyId && row.key_id && row.key_id !== params.keyId) {
    return { ok: false, reason: "challenge_key_mismatch" };
  }

  const consumed = await consumeChallengeRowAtomically({ row });
  if (!consumed) {
    return { ok: false, reason: "challenge_consume_failed" };
  }

  return { ok: true, row };
}

export async function verifyAndStoreAttestation(params: {
  keyId: string;
  attestationBase64: string;
  challengeBase64: string;
  ip: string | null;
  userAgent: string | null;
}) {
  if (
    !params.keyId ||
    !isValidBase64(params.attestationBase64) ||
    !isValidBase64(params.challengeBase64)
  ) {
    throw new Error("Invalid App Attest input");
  }

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
  if (!keyId || !assertion || !challengeId) {
    return {
      ok: false,
      reason: "missing_required_fields",
      publicMessage: "Integrity verification failed.",
    };
  }

  if (!isValidBase64(assertion)) {
    return {
      ok: false,
      reason: "assertion_invalid_base64",
      publicMessage: "Integrity verification failed.",
    };
  }

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
    .maybeSingle<{ key_id: string; public_key_pem: string | null; revoked_at: string | null }>();

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

  const clientDataHash = crypto
    .createHash("sha256")
    .update(assertionPayload)
    .digest();

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

  const { error: lastSeenError } = await supabaseAdmin
    .from("app_attest_keys")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("key_id", keyId);

  if (lastSeenError) {
    console.error("Failed to update app_attest_keys.last_seen_at", {
      keyId,
      message: lastSeenError.message,
    });
  }

  return {
    ok: true,
    reason: "verified",
    publicMessage: "ok",
    payload: {
      keyId,
      challengeId,
    },
  };
}