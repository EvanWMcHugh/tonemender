"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";

const Turnstile = dynamic(() => import("react-turnstile"), {
  ssr: false,
});

// ✅ Only these are excluded from captcha
const CAPTCHA_BYPASS_EMAILS = new Set([
  "pro@tonemender.com",
  "free@tonemender.com",
]);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const [isBypassEmail, setIsBypassEmail] = useState(false);
  const [showCaptcha, setShowCaptcha] = useState(false);

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

    // Always reset captcha when email changes
    setShowCaptcha(false);
    setCaptchaToken(null);
  }, [email]);

  async function verifyTurnstileOrBypass(normalizedEmail: string) {
    const resp = await fetch("/api/turnstile/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: normalizedEmail,
        token: CAPTCHA_BYPASS_EMAILS.has(normalizedEmail) ? null : captchaToken,
      }),
    });

    const json = await resp.json().catch(() => ({}));

    if (!resp.ok || !json?.ok) {
      throw new Error(json?.error || "Captcha verification failed");
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResetSent(false);

    const normalizedEmail = normalizeEmail(email);
    const bypass = CAPTCHA_BYPASS_EMAILS.has(normalizedEmail);

    // If not bypass and no token yet, show captcha first
    if (!bypass && !captchaToken) {
      setShowCaptcha(true);
      return;
    }

    setLoading(true);

    try {
      // ✅ Verify Turnstile server-side (or bypass)
      await verifyTurnstileOrBypass(normalizedEmail);

      // ✅ Then sign in with Supabase (NO captchaToken here, since Supabase captcha is OFF)
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) throw new Error(error.message);

      router.replace("/");
      setCaptchaToken(null);
      setShowCaptcha(false);
    } catch (err: any) {
      setError(err?.message || "Login failed");
      setCaptchaToken(null);
      setShowCaptcha(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword() {
    setError("");
    setResetSent(false);

    const normalizedEmail = normalizeEmail(email);
    const bypass = CAPTCHA_BYPASS_EMAILS.has(normalizedEmail);

    if (!email) {
      setError("Enter your email first.");
      return;
    }

    if (!bypass && !captchaToken) {
      setShowCaptcha(true);
      return;
    }

    setLoading(true);

    try {
      // ✅ Verify Turnstile server-side (or bypass)
      await verifyTurnstileOrBypass(normalizedEmail);

      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: "https://tonemender.com/reset-password",
      });

      if (error) throw new Error(error.message);

      setResetSent(true);
      setCaptchaToken(null);
      setShowCaptcha(false);
    } catch (err: any) {
      setError(err?.message || "Password reset failed");
      setCaptchaToken(null);
      setShowCaptcha(false);
    } finally {
      setLoading(false);
    }
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

        <h1 className="text-2xl font-bold mb-4 text-center">Sign In</h1>

        {error && <p className="text-red-500">{error}</p>}

        <form onSubmit={handleLogin} className="flex flex-col gap-3">
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
              onSuccess={(token) => setCaptchaToken(token)}
              onExpire={() => setCaptchaToken(null)}
              onError={() => setCaptchaToken(null)}
            />
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white p-2 rounded"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <button
          type="button"
          onClick={handleResetPassword}
          disabled={loading}
          className="mt-3 text-sm text-blue-600 underline text-center w-full"
        >
          Forgot your password?
        </button>

        {resetSent && (
          <p className="mt-2 text-sm text-green-600 text-center">
            ✅ Password reset email sent
          </p>
        )}

        <p className="mt-4 text-center text-sm">
          Don’t have an account?{" "}
          <a href="/sign-up" className="text-blue-600 underline">
            Sign Up
          </a>
        </p>
      </div>
    </main>
  );
}