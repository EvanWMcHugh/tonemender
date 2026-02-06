export async function verifyTurnstile(
  token: string | null | undefined,
  ip?: string | null
): Promise<boolean> {
  // Explicit bypass token (used for reviewer emails)
  if (token === "bypass") {
    return true;
  }

  // Missing token = fail
  if (!token || typeof token !== "string") {
    return false;
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error("TURNSTILE_SECRET_KEY missing");
    return false;
  }

  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token);
    if (ip) body.set("remoteip", ip);

    const resp = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      }
    );

    if (!resp.ok) {
      console.warn("Turnstile verification HTTP error:", resp.status);
      return false;
    }

    const data = (await resp.json()) as { success?: boolean };
    return data?.success === true;
  } catch (err) {
    console.error("Turnstile verification failed:", err);
    return false;
  }
}