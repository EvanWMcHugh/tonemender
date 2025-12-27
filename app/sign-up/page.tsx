"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";

const Turnstile = dynamic(() => import("react-turnstile"), {
  ssr: false,
});

// ✅ Only these are excluded from captcha
const CAPTCHA_BYPASS_EMAILS = new Set(["pro@tonemender.com", "free@tonemender.com"]);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

type PendingAction = null | "signup";

export default function SignUpPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [showCaptcha, setShowCaptcha] = useState(false);

  const [isBypassEmail, setIsBypassEmail] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) router.replace("/");
    }
    checkSession();
  }, [router]);

  useEffect(() => {
    const normalized = normalizeEmail(email);
    const bypass = CAPTCHA_BYPASS_EMAILS.has(normalized);
    setIsBypassEmail(bypass);

    // reset captcha when email changes
    setShowCaptcha(false);
    setCaptchaToken(null);
    setPendingAction(null);
  }, [email]);

  async function verifyTurnstileOrBypass(normalizedEmail: string, token: string | null) {
    const resp = await fetch("/api/turnstile/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: normalizedEmail,
        token: CAPTCHA_BYPASS_EMAILS.has(normalizedEmail) ? null : token,
      }),
    });

    const json = await resp.json().catch(() => ({}));

    // Match your sign-in expectation: { ok: true }
    if (!resp.ok || !json?.ok) {
      throw new Error(json?.error || "Captcha verification failed");
    }
  }

  function cleanupCaptchaState() {
    setCaptchaToken(null);
    setShowCaptcha(false);
    setPendingAction(null);
  }

  async function doSignUp(withToken: string | null) {
    setError("");

    const normalizedEmail = normalizeEmail(email);
    const bypass = CAPTCHA_BYPASS_EMAILS.has(normalizedEmail);

    // show captcha only after click
    if (!bypass && !withToken) {
      setPendingAction("signup");
      setShowCaptcha(true);
      return;
    }

    setLoading(true);
    try {
      await verifyTurnstileOrBypass(normalizedEmail, withToken);

      const { error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
      });

      if (error) throw new Error(error.message);

      cleanupCaptchaState();

      // keep your existing flow: you likely want them to confirm email
      router.replace("/check-email");
    } catch (err: any) {
      setError(err?.message || "Sign up failed");
      cleanupCaptchaState();
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    await doSignUp(null);
  }

  async function handleCaptchaSuccess(token: string) {
    setCaptchaToken(token);

    if (pendingAction !== "signup") return;

    await doSignUp(token);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <div className="w-[360px]">
        <Link
          href="/landing"
          className="inline-block mb-4 text-sm text-slate-600 hover:underline"
        >
          ← Back to home
        </Link>

        <h1 className="text-2xl font-bold mb-4 text-center">Sign Up</h1>

        {error && <p className="text-red-500">{error}</p>}

        <form onSubmit={handleSignUp} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email"
            className="border p-2 rounded"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            className="border p-2 rounded"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {!isBypassEmail && showCaptcha && (
            <Turnstile
              sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
              theme="light"
              onSuccess={handleCaptchaSuccess}
              onExpire={() => setCaptchaToken(null)}
              onError={() => setCaptchaToken(null)}
            />
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white p-2 rounded"
          >
            {loading ? "Creating account..." : "Sign Up"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm">
          Already have an account?{" "}
          <a href="/sign-in" className="text-blue-600 underline">
            Sign In
          </a>
        </p>
      </div>
    </main>
  );
}