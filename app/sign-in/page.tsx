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

type PendingAction = null | "login" | "reset" | "resendConfirm";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const [showCaptcha, setShowCaptcha] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);
  const [resendSent, setResendSent] = useState(false);

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

  // Reset captcha state when email changes
  useEffect(() => {
    setShowCaptcha(false);
    setCaptchaToken(null);
    setPendingAction(null);
    setNeedsEmailConfirm(false);
    setResendSent(false);
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
      // If bypass email, server will bypass even if token is null
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

  async function doLogin(withToken: string | null) {
    setError("");
    setResetSent(false);
    setNeedsEmailConfirm(false);
    setResendSent(false);

    // show captcha only after click
    if (!isBypassEmail && !withToken) {
      setPendingAction("login");
      setShowCaptcha(true);
      return;
    }

    setLoading(true);
    try {
      await verifyTurnstileOrBypass(normalizedEmail, withToken);

      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) throw new Error(error.message);

      // ✅ Gate: block unverified emails
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;

      if (!userId) {
        await supabase.auth.signOut();
        throw new Error("Sign in failed. Please try again.");
      }

      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("email_verified")
        .eq("id", userId)
        .single();

      if (profErr) {
        // If we can't verify, fail safe: log out
        await supabase.auth.signOut();
        throw new Error("Could not verify account status. Please try again.");
      }

      if (!profile?.email_verified) {
        await supabase.auth.signOut();
        setNeedsEmailConfirm(true);
        cleanupCaptchaState();
        setError("Please confirm your email before signing in.");
        return;
      }

      cleanupCaptchaState();
      router.replace("/");
    } catch (err: any) {
      setError(err?.message || "Login failed");
      cleanupCaptchaState();
    } finally {
      setLoading(false);
    }
  }

  async function doReset(withToken: string | null) {
    setError("");
    setResetSent(false);
    setNeedsEmailConfirm(false);
    setResendSent(false);

    if (!normalizedEmail) {
      setError("Enter your email first.");
      return;
    }

    // show captcha only after click
    if (!isBypassEmail && !withToken) {
      setPendingAction("reset");
      setShowCaptcha(true);
      return;
    }

    setLoading(true);
    try {
      await verifyTurnstileOrBypass(normalizedEmail, withToken);

      // ✅ Custom password reset flow (no Supabase reset email)
      const resp = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          turnstileToken: CAPTCHA_BYPASS_EMAILS.has(normalizedEmail) ? "bypass" : withToken,
        }),
      });

      if (!resp.ok) {
        let json: any = {};
        try {
          json = await resp.json();
        } catch {
          json = {};
        }
        throw new Error(json?.error || "Password reset failed");
      }

      setResetSent(true);
      cleanupCaptchaState();

      router.push("/check-email?type=password-reset");
    } catch (err: any) {
      setError(err?.message || "Password reset failed");
      cleanupCaptchaState();
    } finally {
      setLoading(false);
    }
  }

  async function doResendConfirmation(withToken: string | null) {
    setError("");
    setNeedsEmailConfirm(false);
    setResendSent(false);

    if (!normalizedEmail) {
      setError("Enter your email first.");
      return;
    }

    // show captcha only after click
    if (!isBypassEmail && !withToken) {
      setPendingAction("resendConfirm");
      setShowCaptcha(true);
      return;
    }

    setLoading(true);
    try {
      await verifyTurnstileOrBypass(normalizedEmail, withToken);

      const resp = await fetch("/api/auth/resend-signup-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          turnstileToken: CAPTCHA_BYPASS_EMAILS.has(normalizedEmail) ? "bypass" : withToken,
        }),
      });

      // Don’t leak whether account exists
      if (!resp.ok) {
        let json: any = {};
        try {
          json = await resp.json();
        } catch {
          json = {};
        }
        throw new Error(json?.error || "Could not resend confirmation email");
      }

      setResendSent(true);
      cleanupCaptchaState();
      router.push("/check-email?type=confirm-email");
    } catch (err: any) {
      setError(err?.message || "Could not resend confirmation email");
      cleanupCaptchaState();
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    await doLogin(null);
  }

  async function handleResetPassword() {
    await doReset(null);
  }

  async function handleResend() {
    await doResendConfirmation(null);
  }

  // When captcha succeeds, automatically finish the pending action
  async function handleCaptchaSuccess(token: string) {
    setCaptchaToken(token);

    if (!pendingAction) return;

    if (pendingAction === "login") {
      await doLogin(token);
    } else if (pendingAction === "reset") {
      await doReset(token);
    } else if (pendingAction === "resendConfirm") {
      await doResendConfirmation(token);
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

        {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

        <form onSubmit={handleLogin} className="flex flex-col gap-3">
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
            autoComplete="current-password"
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
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <button
          type="button"
          onClick={handleResetPassword}
          disabled={loading}
          className="mt-3 text-sm text-blue-600 underline text-center w-full disabled:opacity-60"
        >
          Forgot your password?
        </button>

        {resetSent && (
          <p className="mt-2 text-sm text-green-600 text-center">
            ✅ Password reset email sent
          </p>
        )}

        {needsEmailConfirm && (
          <button
            type="button"
            onClick={handleResend}
            disabled={loading}
            className="mt-3 text-sm text-blue-600 underline text-center w-full disabled:opacity-60"
          >
            Resend confirmation email
          </button>
        )}

        {resendSent && (
          <p className="mt-2 text-sm text-green-600 text-center">
            ✅ Confirmation email sent
          </p>
        )}

        <p className="mt-4 text-center text-sm">
          Don’t have an account?{" "}
          <Link href="/sign-up" className="text-blue-600 underline">
            Sign Up
          </Link>
        </p>
      </div>
    </main>
  );
}