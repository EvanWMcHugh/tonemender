import crypto from "crypto";

const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";

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

async function getGoogleAccessToken(scope: string): Promise<string> {
  const clientEmail = getEnv("GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL");
  const privateKey = normalizePrivateKey(
    getEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY")
  );

  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const claimSet = {
    iss: clientEmail,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const unsignedJwt = `${base64Url(JSON.stringify(header))}.${base64Url(
    JSON.stringify(claimSet)
  )}`;

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
    throw new Error(
      `Failed to get Google access token: ${tokenRes.status} ${text}`
    );
  }

  const tokenJson = await tokenRes.json();

  if (!tokenJson?.access_token || typeof tokenJson.access_token !== "string") {
    throw new Error("Google access token missing from response");
  }

  return tokenJson.access_token;
}

export function getGooglePlayPackageName() {
  const packageName = getEnv("GOOGLE_PLAY_PACKAGE_NAME");
  return packageName;
}

export async function getGooglePlaySubscription({
  packageName,
  purchaseToken,
}: {
  packageName: string;
  purchaseToken: string;
}) {
  const accessToken = await getGoogleAccessToken(ANDROID_PUBLISHER_SCOPE);

  const res = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
      packageName
    )}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Google Play subscription lookup failed: ${res.status} ${text}`
    );
  }

  return res.json();
}