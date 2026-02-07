export async function verifyTurnstile(token: string, ip: string | null) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error("TURNSTILE_SECRET_KEY is missing");
    return false;
  }

  try {
    const form = new FormData();
    form.append("secret", secret);
    form.append("response", token);
    if (ip) form.append("remoteip", ip);

    const resp = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body: form }
    );

    const data = (await resp.json()) as {
      success: boolean;
      "error-codes"?: string[];
      hostname?: string;
      action?: string;
      cdata?: string;
    };

    if (!data.success) {
      console.error("Turnstile verify failed:", {
        codes: data["error-codes"] ?? [],
        hostname: data.hostname ?? null,
        action: data.action ?? null,
      });
    }

    return !!data.success;
  } catch (e) {
    console.error("Turnstile verify error:", e);
    return false;
  }
}