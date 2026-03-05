"use client";

import { useEffect, useId, useMemo, useState } from "react";
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
  const emailId = useId();
  const passwordId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [showCaptcha, setShowCaptcha] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  // store last captcha token; treat as single-use
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const normalizedEmail = useMemo(() => normalizeEmail(email), [email]);
  const isBypassEmail = useMemo(
    () => (normalizedEmail ? CAPTCHA_BYPASS_EMAILS.has(normalizedEmail) : false),
    [normalizedEmail]
  );

  const canAttemptLogin = useMemo(() => {
    if (loading) return false;
    if (!normalizedEmail) return false;
    if (!password) return false;
    return true;
  }, [loading, normalizedEmail, password]);

  // If already logged in, go home
  useEffect(() => {
    const controller = new AbortController();

    async function checkSession() {
      try {
        const resp = await fetch("/api/me", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        const json = await resp.json().catch(() => ({}));

        if (json?.user?.id) {
          // hard redirect avoids any SPA auth race
          window.location.href = "/";
        }
      } catch {
        // ignore
      }
    }

    checkSession();
    return () => controller.abort();
  }, []);

  // Reset captcha + messaging when email changes (prevents token reuse across accounts)
  useEffect(() => {
    setShowCaptcha(false);
    setPendingAction(null);
    setCaptchaToken(null);

    setNeedsEmailConfirm(false);
    setResendSent(false);
    setResetSent(false);

    setError("");
  }, [normalizedEmail]);

  function cleanupCaptchaState() {
    setShowCaptcha(false);
    setPendingAction(null);
    setCaptchaToken(null);
  }

  function requireCaptcha(action: PendingAction) {
    setPendingAction(action);
    setShowCaptcha(true);
    setError("");
  }

  async function doLogin(token: string | null) {
    setError("");
    setResetSent(false);
    setNeedsEmailConfirm(false);
    setResendSent(false);

    if (!normalizedEmail) {
      setError("Enter your email.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }
    if (loading) return;

    // Show captcha only after click
    if (!isBypassEmail && !token) {
      requireCaptcha("login");
      return;
    }

    // snapshot token and clear immediately to prevent reuse/double-submit
    const tokenToUse = token;
    if (!isBypassEmail) setCaptchaToken(null);

    setLoading(true);
    try {
      const payload: any = { email: normalizedEmail, password };
      if (!isBypassEmail) payload.captchaToken = tokenToUse;

      const resp = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        const msg = json?.error || "Login failed";
        if (String(msg).toLowerCase().includes("not confirmed")) {
          setNeedsEmailConfirm(true);
        }
        throw new Error(msg);
      }

      cleanupCaptchaState();

      // 🔥 Hard redirect ensures tm_session cookie is present before /api/me runs on home
      window.location.href = "/";
    } catch (err: any) {
      setError(err?.message || "Login failed");
      cleanupCaptchaState();
    } finally {
      setLoading(false);
    }
  }

  async function doReset(token: string | null) {
    setError("");
    setResetSent(false);
    setNeedsEmailConfirm(false);
    setResendSent(false);

    if (!normalizedEmail) {
      setError("Enter your email first.");
      return;
    }
    if (loading) return;

    if (!isBypassEmail && !token) {
      requireCaptcha("reset");
      return;
    }

    const tokenToUse = token;
    if (!isBypassEmail) setCaptchaToken(null);

    setLoading(true);
    try {
      const payload: any = { email: normalizedEmail };
      if (!isBypassEmail) payload.turnstileToken = tokenToUse;

      const resp = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok) throw new Error(json?.error || "Password reset failed");

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

  async function doResendConfirmation(token: string | null) {
    setError("");
    setNeedsEmailConfirm(false);
    setResendSent(false);

    if (!normalizedEmail) {
      setError("Enter your email first.");
      return;
    }
    if (loading) return;

    if (!isBypassEmail && !token) {
      requireCaptcha("resendConfirm");
      return;
    }

    const tokenToUse = token;
    if (!isBypassEmail) setCaptchaToken(null);

    setLoading(true);
    try {
      const payload: any = { email: normalizedEmail };
      if (!isBypassEmail) payload.turnstileToken = tokenToUse;

      const resp = await fetch("/api/auth/resend-signup-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        throw new Error(json?.error || "Could not resend confirmation email");
      }

      setResendSent(true);
      cleanupCaptchaState();
      router.push("/check-email?type=signup");
    } catch (err: any) {
      setError(err?.message || "Could not resend confirmation email");
      cleanupCaptchaState();
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!canAttemptLogin) {
      setError(!normalizedEmail ? "Enter your email." : "Enter your password.");
      return;
    }
    await doLogin(isBypassEmail ? null : captchaToken);
  }

  async function handleResetPassword() {
    await doReset(isBypassEmail ? null : captchaToken);
  }

  async function handleResend() {
    await doResendConfirmation(isBypassEmail ? null : captchaToken);
  }

  async function handleCaptchaSuccess(token: string) {
    if (!pendingAction) return;
    if (loading) return;

    // store token and immediately execute the pending action (single-use)
    setCaptchaToken(token);

    if (pendingAction === "login") await doLogin(token);
    else if (pendingAction === "reset") await doReset(token);
    else if (pendingAction === "resendConfirm") await doResendConfirmation(token);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <div className="w-[360px]">
        <Link
          href="/landing"
          className="inline-flex items-center gap-1 mb-4 text-sm text-slate-600 hover:underline"
        >
          <span aria-hidden>←</span>
          <span>Back to home</span>
        </Link>

        <h1 className="text-2xl font-bold mb-2 text-center">Sign In</h1>
        <p className="text-sm text-slate-500 mb-6 text-center">
          Welcome back. Sign in to continue.
        </p>

        {error && (
          <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          <div>
            <label htmlFor={emailId} className="sr-only">
              Email
            </label>
            <input
              id={emailId}
              type="email"
              placeholder="Email"
              className="border p-3 rounded-2xl w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              inputMode="email"
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor={passwordId} className="sr-only">
              Password
            </label>
            <input
              id={passwordId}
              type="password"
              placeholder="Password"
              className="border p-3 rounded-2xl w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={loading}
            />
          </div>

          {!isBypassEmail && showCaptcha && (
            <div className="mt-1">
              <Turnstile
                sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
                theme="light"
                onSuccess={handleCaptchaSuccess}
                onExpire={() => {
                  setCaptchaToken(null);
                  setError("Captcha expired. Please try again.");
                }}
                onError={() => {
                  setCaptchaToken(null);
                  setError("Captcha error. Please try again.");
                }}
              />
              <p className="text-[11px] text-slate-500 mt-2">
                Complete the captcha to continue.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-3 rounded-2xl font-semibold
                       hover:bg-blue-500 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <button
          type="button"
          onClick={handleResetPassword}
          disabled={loading || !normalizedEmail}
          className="mt-3 text-sm text-blue-600 underline text-center w-full disabled:opacity-60 disabled:cursor-not-allowed"
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
            disabled={loading || !normalizedEmail}
            className="mt-3 text-sm text-blue-600 underline text-center w-full disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Resend confirmation email
          </button>
        )}

        {resendSent && (
          <p className="mt-2 text-sm text-green-600 text-center">
            ✅ Confirmation email sent
          </p>
        )}

        <p className="mt-6 text-center text-sm">
          Don’t have an account?{" "}
          <Link href="/sign-up" className="text-blue-600 underline">
            Sign Up
          </Link>
        </p>
      </div>
    </main>
  );
}