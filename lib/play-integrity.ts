import crypto from "crypto";

type VerifyAndroidPlayIntegrityArgs = {
  integrityToken: string;
  expectedPackageName: string;
  expectedNonce?: string;
  expectedRequestHash?: string;
  maxAgeMs?: number;
};

type VerifyAndroidPlayIntegrityResult = {
  ok: boolean;
  reason: string;
  publicMessage: string;
  payload?: any;
};

const PLAY_INTEGRITY_SCOPE = "https://www.googleapis.com/auth/playintegrity";

function getEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, "\n");
}

function base64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function getGoogleAccessToken(): Promise<string> {
  const clientEmail = getEnv("GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL");
  const privateKey = normalizePrivateKey(getEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"));

  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const claimSet = {
    iss: clientEmail,
    scope: PLAY_INTEGRITY_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const unsignedJwt = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claimSet))}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsignedJwt);
  signer.end();

  const signature = signer.sign(privateKey);
  const jwt = `${unsignedJwt}.${base64Url(signature)}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
    cache: "no-store",
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => "");
    throw new Error(`Failed to get Google access token: ${tokenRes.status} ${text}`);
  }

  const tokenJson = await tokenRes.json();
  if (!tokenJson?.access_token || typeof tokenJson.access_token !== "string") {
    throw new Error("Google access token missing from response");
  }

  return tokenJson.access_token;
}

async function decodeIntegrityToken(
  packageName: string,
  integrityToken: string
): Promise<any> {
  const accessToken = await getGoogleAccessToken();

  const decodeRes = await fetch(
    `https://playintegrity.googleapis.com/v1/${encodeURIComponent(
      packageName
    )}:decodeIntegrityToken`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        integrity_token: integrityToken,
      }),
      cache: "no-store",
    }
  );

  if (!decodeRes.ok) {
    const text = await decodeRes.text().catch(() => "");
    throw new Error(`Play Integrity decode failed: ${decodeRes.status} ${text}`);
  }

  return decodeRes.json();
}

export async function verifyAndroidPlayIntegrity({
  integrityToken,
  expectedPackageName,
  expectedNonce,
  expectedRequestHash,
  maxAgeMs = 2 * 60 * 1000,
}: VerifyAndroidPlayIntegrityArgs): Promise<VerifyAndroidPlayIntegrityResult> {
  try {
    const decoded = await decodeIntegrityToken(expectedPackageName, integrityToken);

    const payload =
      decoded?.tokenPayloadExternal ||
      decoded?.tokenPayload ||
      null;

    if (!payload) {
      return {
        ok: false,
        reason: "missing_payload",
        publicMessage: "Integrity verification failed.",
      };
    }

    const requestDetails = payload.requestDetails ?? {};
    const appIntegrity = payload.appIntegrity ?? {};
    const deviceIntegrity = payload.deviceIntegrity ?? {};

    const requestPackageName = requestDetails.requestPackageName;
    const requestHash = requestDetails.requestHash;
    const requestNonce = requestDetails.nonce;
    const timestampMillisRaw = requestDetails.timestampMillis;

    if (requestPackageName !== expectedPackageName) {
      return {
        ok: false,
        reason: "package_mismatch",
        publicMessage: "Integrity verification failed.",
        payload,
      };
    }

    if (expectedRequestHash && requestHash !== expectedRequestHash) {
      return {
        ok: false,
        reason: "request_hash_mismatch",
        publicMessage: "Integrity verification failed.",
        payload,
      };
    }

    if (expectedNonce && requestNonce !== expectedNonce) {
      return {
        ok: false,
        reason: "nonce_mismatch",
        publicMessage: "Integrity verification failed.",
        payload,
      };
    }

    const timestampMillis = Number(timestampMillisRaw);
    if (!Number.isFinite(timestampMillis)) {
      return {
        ok: false,
        reason: "bad_timestamp",
        publicMessage: "Integrity verification failed.",
        payload,
      };
    }

    if (Math.abs(Date.now() - timestampMillis) > maxAgeMs) {
      return {
        ok: false,
        reason: "stale_token",
        publicMessage: "Integrity check expired. Please try again.",
        payload,
      };
    }

    const appRecognitionVerdict = appIntegrity.appRecognitionVerdict;
    if (appRecognitionVerdict !== "PLAY_RECOGNIZED") {
      return {
        ok: false,
        reason: "app_not_play_recognized",
        publicMessage: "App integrity check failed.",
        payload,
      };
    }

    const deviceRecognitionVerdict: string[] =
      deviceIntegrity.deviceRecognitionVerdict ?? [];

    if (
      !Array.isArray(deviceRecognitionVerdict) ||
      deviceRecognitionVerdict.length === 0
    ) {
      return {
        ok: false,
        reason: "device_not_recognized",
        publicMessage: "Device integrity check failed.",
        payload,
      };
    }

    return {
      ok: true,
      reason: "ok",
      publicMessage: "ok",
      payload,
    };
  } catch (error) {
    console.error("verifyAndroidPlayIntegrity error:", error);
    return {
      ok: false,
      reason: "verification_exception",
      publicMessage: "Integrity verification failed.",
    };
  }
}