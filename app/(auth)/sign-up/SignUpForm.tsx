"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

const Turnstile = dynamic(() => import("react-turnstile"), { ssr: false });

const MIN_PASSWORD_LEN = 8;
const MAX_PASSWORD_LEN = 200;

type PendingAction = null | "signup";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getPasswordIssue(password: string) {
  if (password.length < MIN_PASSWORD_LEN) {
    return `Password must be at least ${MIN_PASSWORD_LEN} characters.`;
  }
  if (password.length > MAX_PASSWORD_LEN) {
    return "Password is too long.";
  }
  return "";
}

export default function SignUpForm() {
  const router = useRouter();
  const emailId = useId();
  const passwordId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [showCaptcha, setShowCaptcha] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const normalizedEmail = useMemo(() => normalizeEmail(email), [email]);
  const passwordIssue = useMemo(() => getPasswordIssue(password), [password]);

  const canAttemptSignup = useMemo(() => {
    if (loading) return false;
    if (!normalizedEmail) return false;
    if (!password) return false;
    if (passwordIssue) return false;
    return true;
  }, [loading, normalizedEmail, password, passwordIssue]);

  function resetUiState() {
    setError("");
  }

  function cleanupCaptchaState() {
    setShowCaptcha(false);
    setPendingAction(null);
  }

  function resetForEmailChange() {
    setShowCaptcha(false);
    setPendingAction(null);
    setError("");
  }

  function requireCaptcha() {
    setPendingAction("signup");
    setShowCaptcha(true);
    setError("");
  }

  async function doSignUp(token: string | null) {
    resetUiState();

    if (!normalizedEmail) {
      setError("Enter your email.");
      return;
    }

    const issue = getPasswordIssue(password);
    if (issue) {
      setError(issue);
      return;
    }

    if (loading) return;

    if (!token) {
      requireCaptcha();
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          captchaToken: token,
        }),
      });

      const json = await response.json().catch(() => ({}));

      if (!response.ok || !json?.success) {
        throw new Error(json?.error || "Sign up failed");
      }

      cleanupCaptchaState();

      router.replace(
        `/check-email?type=signup&email=${encodeURIComponent(normalizedEmail)}`
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign up failed");
      cleanupCaptchaState();
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!canAttemptSignup) {
      if (!normalizedEmail) {
        setError("Enter your email.");
      } else if (!password) {
        setError("Enter a password.");
      } else if (passwordIssue) {
        setError(passwordIssue);
      } else {
        setError("Please try again.");
      }
      return;
    }

    await doSignUp(null);
  }

  async function handleCaptchaSuccess(token: string) {
    if (pendingAction !== "signup" || loading) return;
    await doSignUp(token);
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
          <h1 className="mb-2 text-center text-2xl font-bold">Sign Up</h1>
          <p className="mb-6 text-center text-sm text-slate-500">
            Create an account to start rewriting safely.
          </p>

          {error && (
            <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LEN}
                disabled={loading}
                aria-invalid={Boolean(password && passwordIssue)}
              />
              {password && passwordIssue && (
                <p className="mt-1 text-[11px] text-slate-500">{passwordIssue}</p>
              )}
            </div>

            {showCaptcha && (
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
                  Complete the captcha to create your account.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm">
            Already have an account?{" "}
            <Link href="/sign-in" className="text-blue-600 underline">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}