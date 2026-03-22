"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";

import { isReviewerEmail } from "@/lib/auth/reviewers";

const Turnstile = dynamic(() => import("react-turnstile"), { ssr: false });

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

type PendingAction = null | "login" | "reset" | "resendConfirm";

async function waitForSession(maxAttempts = 12, delayMs = 250) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch("/api/user/me", {
        method: "GET",
        cache: "no-store",
      });

      const json = await response.json().catch(() => ({}));

      if (json?.user?.id) {
        return true;
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return false;
}

export default function SignInForm() {
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

  const normalizedEmail = useMemo(() => normalizeEmail(email), [email]);

  const isBypassEmail = useMemo(() => {
    return isReviewerEmail(normalizedEmail);
  }, [normalizedEmail]);

  const canAttemptLogin = useMemo(() => {
    if (loading) return false;
    if (!normalizedEmail) return false;
    if (!password) return false;
    return true;
  }, [loading, normalizedEmail, password]);

  function resetUiState() {
    setError("");
    setResetSent(false);
    setNeedsEmailConfirm(false);
    setResendSent(false);
  }

  function cleanupCaptchaState() {
    setShowCaptcha(false);
    setPendingAction(null);
  }

  function resetForEmailChange() {
    setShowCaptcha(false);
    setPendingAction(null);
    setNeedsEmailConfirm(false);
    setResendSent(false);
    setResetSent(false);
    setError("");
  }

  function requireCaptcha(action: PendingAction) {
    setPendingAction(action);
    setShowCaptcha(true);
    setError("");
  }

  async function doLogin(token: string | null) {
    resetUiState();

    if (!normalizedEmail) {
      setError("Enter your email.");
      return;
    }

    if (!password) {
      setError("Enter your password.");
      return;
    }

    if (loading) return;

    if (!isBypassEmail && !token) {
      requireCaptcha("login");
      return;
    }

    setLoading(true);

    try {
      const payload: {
        email: string;
        password: string;
        captchaToken?: string | null;
      } = {
        email: normalizedEmail,
        password,
      };

      if (!isBypassEmail) {
        payload.captchaToken = token;
      }

      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorCode = json?.error;
        const message = json?.message || json?.error || "Login failed";

        if (errorCode === "EMAIL_NOT_VERIFIED") {
          setNeedsEmailConfirm(true);
        }

        throw new Error(message);
      }

      cleanupCaptchaState();

      const sessionReady = await waitForSession();

      if (!sessionReady) {
        throw new Error("Signed in, but session was not ready. Please try again.");
      }

      router.replace("/");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
      cleanupCaptchaState();
    } finally {
      setLoading(false);
    }
  }

  async function doReset(token: string | null) {
    resetUiState();

    if (!normalizedEmail) {
      setError("Enter your email first.");
      return;
    }

    if (loading) return;

    if (!isBypassEmail && !token) {
      requireCaptcha("reset");
      return;
    }

    setLoading(true);

    try {
      const payload: {
        email: string;
        turnstileToken?: string | null;
      } = {
        email: normalizedEmail,
      };

      if (!isBypassEmail) {
        payload.turnstileToken = token;
      }

      const response = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(json?.error || "Password reset failed");
      }

      setResetSent(true);
      cleanupCaptchaState();
      router.push("/check-email?type=password-reset");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Password reset failed");
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

    setLoading(true);

    try {
      const payload: {
        email: string;
        turnstileToken?: string | null;
      } = {
        email: normalizedEmail,
      };

      if (!isBypassEmail) {
        payload.turnstileToken = token;
      }

      const response = await fetch("/api/auth/resend-signup-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(json?.error || "Could not resend confirmation email");
      }

      setResendSent(true);
      cleanupCaptchaState();
      router.push("/check-email?type=signup");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not resend confirmation email"
      );
      cleanupCaptchaState();
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!canAttemptLogin) {
      setError(!normalizedEmail ? "Enter your email." : "Enter your password.");
      return;
    }

    await doLogin(null);
  }

  async function handleResetPassword() {
    await doReset(null);
  }

  async function handleResend() {
    await doResendConfirmation(null);
  }

  async function handleCaptchaSuccess(token: string) {
    if (!pendingAction || loading) return;

    if (pendingAction === "login") {
      await doLogin(token);
      return;
    }

    if (pendingAction === "reset") {
      await doReset(token);
      return;
    }

    if (pendingAction === "resendConfirm") {
      await doResendConfirmation(token);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm">
        <Link
          href="/landing"
          className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"
        >
          <span aria-hidden>←</span>
          <span>Back to home</span>
        </Link>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg sm:p-8">
          <h1 className="mb-2 text-center text-2xl font-bold">Sign In</h1>
          <p className="mb-6 text-center text-sm text-slate-500">
            Welcome back. Sign in to continue.
          </p>

          {error && (
            <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-700">{error}</p>
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
                className="w-full rounded-2xl border p-3"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  resetForEmailChange();
                }}
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
                className="w-full rounded-2xl border p-3"
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
                    setError("Captcha expired. Please try again.");
                  }}
                  onError={() => {
                    setError("Captcha error. Please try again.");
                  }}
                />
                <p className="mt-2 text-[11px] text-slate-500">
                  Complete the captcha to continue.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <button
            type="button"
            onClick={handleResetPassword}
            disabled={loading || !normalizedEmail}
            className="mt-3 w-full text-center text-sm text-blue-600 underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            Forgot your password?
          </button>

          {resetSent && (
            <p className="mt-2 text-center text-sm text-green-600">
              ✅ Password reset email sent
            </p>
          )}

          {needsEmailConfirm && (
            <button
              type="button"
              onClick={handleResend}
              disabled={loading || !normalizedEmail}
              className="mt-3 w-full text-center text-sm text-blue-600 underline disabled:cursor-not-allowed disabled:opacity-60"
            >
              Resend confirmation email
            </button>
          )}

          {resendSent && (
            <p className="mt-2 text-center text-sm text-green-600">
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
      </div>
    </main>
  );
}