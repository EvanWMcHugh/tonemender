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

const MIN_PASSWORD_LEN = 8;
const MAX_PASSWORD_LEN = 200;

type PendingAction = null | "signup";

function getPasswordIssue(pw: string) {
  if (pw.length < MIN_PASSWORD_LEN)
    return `Password must be at least ${MIN_PASSWORD_LEN} characters.`;
  if (pw.length > MAX_PASSWORD_LEN) return "Password is too long.";
  return "";
}

export default function SignUpPage() {
  const router = useRouter();
  const emailId = useId();
  const passwordId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [showCaptcha, setShowCaptcha] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const normalizedEmail = useMemo(() => normalizeEmail(email), [email]);
  const isBypassEmail = useMemo(
    () => (normalizedEmail ? CAPTCHA_BYPASS_EMAILS.has(normalizedEmail) : false),
    [normalizedEmail]
  );

  const passwordIssue = useMemo(() => getPasswordIssue(password), [password]);

  const canAttemptSignup = useMemo(() => {
    if (loading) return false;
    if (!normalizedEmail) return false;
    if (!password) return false;
    if (passwordIssue) return false;
    return true;
  }, [loading, normalizedEmail, password, passwordIssue]);

  // If already logged in, go home
  useEffect(() => {
    const controller = new AbortController();

    async function checkSession() {
      try {
        const resp = await fetch("/api/user/me", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        const json = await resp.json().catch(() => ({ user: null }));
        if (json?.user?.id) router.replace("/");
      } catch {
        // ignore
      }
    }

    checkSession();
    return () => controller.abort();
  }, [router]);

  // Reset captcha when email changes
  useEffect(() => {
    setShowCaptcha(false);
    setPendingAction(null);
    setCaptchaToken(null);
    setError("");
  }, [normalizedEmail]);

  function cleanupCaptchaState() {
    setShowCaptcha(false);
    setPendingAction(null);
    setCaptchaToken(null);
  }

  function requireCaptcha() {
    setPendingAction("signup");
    setShowCaptcha(true);
    setError("");
  }

  async function doSignUp(withToken: string | null) {
    setError("");

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

    // Show captcha only after click
    if (!isBypassEmail && !withToken) {
      requireCaptcha();
      return;
    }

    // snapshot token and clear immediately to prevent reuse/double-submit
    const tokenToUse = withToken;
    if (!isBypassEmail) setCaptchaToken(null);

    setLoading(true);
    try {
      const payload: any = {
        email: normalizedEmail,
        password,
      };

      // Only include captchaToken when needed
      if (!isBypassEmail) payload.captchaToken = tokenToUse;

      const resp = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok) throw new Error(json?.error || "Sign up failed");

      // ✅ API returns { success: true }
      if (!json?.success) throw new Error(json?.error || "Sign up failed");

      cleanupCaptchaState();
      router.replace("/check-email?type=signup");
    } catch (err: any) {
      setError(err?.message || "Sign up failed");
      cleanupCaptchaState();
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();

    if (!canAttemptSignup) {
      if (!normalizedEmail) setError("Enter your email.");
      else if (!password) setError("Enter a password.");
      else if (passwordIssue) setError(passwordIssue);
      else setError("Please try again.");
      return;
    }

    await doSignUp(isBypassEmail ? null : captchaToken);
  }

  async function handleCaptchaSuccess(token: string) {
    if (pendingAction !== "signup") return;
    if (loading) return;

    // store token and immediately execute the pending action (single-use)
    setCaptchaToken(token);
    await doSignUp(token);
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

        <h1 className="text-2xl font-bold mb-2 text-center">Sign Up</h1>
        <p className="text-sm text-slate-500 mb-6 text-center">
          Create an account to start rewriting safely.
        </p>

        {error && (
          <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSignUp} className="flex flex-col gap-3">
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
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LEN}
              disabled={loading}
              aria-invalid={!!password && !!passwordIssue}
            />
            {password && passwordIssue && (
              <p className="text-[11px] text-slate-500 mt-1">{passwordIssue}</p>
            )}
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
                Complete the captcha to create your account.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-3 rounded-2xl font-semibold
                       hover:bg-blue-500 transition disabled:opacity-60 disabled:cursor-not-allowed"
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
    </main>
  );
}