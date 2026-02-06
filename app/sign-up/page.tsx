"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";

const Turnstile = dynamic(() => import("react-turnstile"), { ssr: false });

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

  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const normalizedEmail = useMemo(() => normalizeEmail(email), [email]);
  const isBypassEmail = useMemo(
    () => CAPTCHA_BYPASS_EMAILS.has(normalizedEmail),
    [normalizedEmail]
  );

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (!cancelled && data?.session?.user) router.replace("/");
    }

    checkSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // Reset captcha when email changes
  useEffect(() => {
    setShowCaptcha(false);
    setCaptchaToken(null);
    setPendingAction(null);
  }, [normalizedEmail]);

  function cleanupCaptchaState() {
    setCaptchaToken(null);
    setShowCaptcha(false);
    setPendingAction(null);
  }

  async function verifyTurnstileOrBypass(emailToVerify: string, token: string | null) {
    const resp = await fetch("/api/turnstile/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: emailToVerify,
        token: CAPTCHA_BYPASS_EMAILS.has(emailToVerify) ? null : token,
      }),
    });

    let json: any = {};
    try {
      json = await resp.json();
    } catch {
      json = {};
    }

    if (!resp.ok || !json?.ok) {
      throw new Error(json?.error || "Captcha verification failed");
    }
  }

  async function doSignUp(withToken: string | null) {
    setError("");

    // show captcha only after click
    if (!isBypassEmail && !withToken) {
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

        {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

        <form onSubmit={handleSignUp} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email"
            className="border p-2 rounded"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            inputMode="email"
          />

          <input
            type="password"
            placeholder="Password"
            className="border p-2 rounded"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            minLength={8}
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
            className="bg-blue-600 text-white p-2 rounded disabled:opacity-60"
          >
            {loading ? "Creating account..." : "Sign Up"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm">
          Already have an account?{" "}
          <Link href="/sign-in" className="text-blue-600 underline">
            Sign In
          </Link>
        </p>
      </div>
    </main>
  );
}