"use client";

import { useEffect, useMemo, useState } from "react";
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

  const [resetSent, setResetSent] = useState(false);

  const [showCaptcha, setShowCaptcha] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  const normalizedEmail = useMemo(() => normalizeEmail(email), [email]);
  const isBypassEmail = useMemo(
    () => (normalizedEmail ? CAPTCHA_BYPASS_EMAILS.has(normalizedEmail) : false),
    [normalizedEmail]
  );

  // If already logged in, go home
  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const resp = await fetch("/api/me", { method: "GET" });
        const json = await resp.json().catch(() => ({}));
        if (!cancelled && json?.user?.id) router.replace("/");
      } catch {}
    }

    checkSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // Reset captcha + messaging when email changes
  useEffect(() => {
    setShowCaptcha(false);
    setPendingAction(null);
    setNeedsEmailConfirm(false);
    setResendSent(false);
    setResetSent(false);
    setError("");
  }, [normalizedEmail]);

  function cleanupCaptchaState() {
    setShowCaptcha(false);
    setPendingAction(null);
  }

  async function preauthOrThrow(emailToVerify: string, token: string | null) {
    const resp = await fetch("/api/auth/preauth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: emailToVerify,
        token: isBypassEmail ? "bypass" : token,
      }),
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok || !json?.ok) {
      throw new Error(json?.error || "Captcha verification failed");
    }
  }

  async function doLogin(withToken: string | null) {
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

    // show captcha only after click
    if (!isBypassEmail && !withToken) {
      setPendingAction("login");
      setShowCaptcha(true);
      return;
    }

    setLoading(true);
    try {
      await preauthOrThrow(normalizedEmail, withToken);

      const resp = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          captchaToken: isBypassEmail ? "bypass" : withToken,
        }),
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

    if (loading) return;

    // show captcha only after click
    if (!isBypassEmail && !withToken) {
      setPendingAction("reset");
      setShowCaptcha(true);
      return;
    }

    setLoading(true);
    try {
      await preauthOrThrow(normalizedEmail, withToken);

      const resp = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          turnstileToken: isBypassEmail ? "bypass" : withToken,
        }),
      });

      if (!resp.ok) {
        const json = await resp.json().catch(() => ({}));
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

    if (loading) return;

    // show captcha only after click
    if (!isBypassEmail && !withToken) {
      setPendingAction("resendConfirm");
      setShowCaptcha(true);
      return;
    }

    setLoading(true);
    try {
      await preauthOrThrow(normalizedEmail, withToken);

      const resp = await fetch("/api/auth/resend-signup-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          turnstileToken: isBypassEmail ? "bypass" : withToken,
        }),
      });

      if (!resp.ok) {
        const json = await resp.json().catch(() => ({}));
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
    await doLogin(null);
  }

  async function handleResetPassword() {
    await doReset(null);
  }

  async function handleResend() {
    await doResendConfirmation(null);
  }

  async function handleCaptchaSuccess(token: string) {
    if (!pendingAction) return;
    if (loading) return;

    if (pendingAction === "login") await doLogin(token);
    else if (pendingAction === "reset") await doReset(token);
    else if (pendingAction === "resendConfirm") await doResendConfirmation(token);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <div className="w-[360px]">
        <Link href="/landing" className="inline-block mb-4 text-sm text-slate-600 hover:underline">
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
              onExpire={() => {}}
              onError={() => {}}
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
          <p className="mt-2 text-sm text-green-600 text-center">✅ Password reset email sent</p>
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
          <p className="mt-2 text-sm text-green-600 text-center">✅ Confirmation email sent</p>
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