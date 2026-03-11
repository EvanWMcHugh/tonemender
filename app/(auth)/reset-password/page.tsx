"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";

const Turnstile = dynamic(() => import("react-turnstile"), { ssr: false });

const MIN_PASSWORD_LEN = 8;
const MAX_PASSWORD_LEN = 200;

function getPasswordIssue(pw: string) {
  if (pw.length < MIN_PASSWORD_LEN)
    return `Password must be at least ${MIN_PASSWORD_LEN} characters.`;
  if (pw.length > MAX_PASSWORD_LEN) return "Password is too long.";
  return "";
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const passwordIssue = useMemo(() => getPasswordIssue(password), [password]);
  const passwordsMatch = useMemo(
    () => password.length > 0 && password === confirm,
    [password, confirm]
  );

  const canSubmit = useMemo(() => {
    if (!token) return false;
    if (!turnstileToken) return false;
    if (loading) return false;
    if (passwordIssue) return false;
    if (!passwordsMatch) return false;
    return true;
  }, [token, turnstileToken, loading, passwordIssue, passwordsMatch]);

  // When the link token changes, reset captcha & state for safety
  useEffect(() => {
    setTurnstileToken(null);
    setSuccess(false);
    setError("");
    // Also clear any pending redirect
    if (redirectTimerRef.current) {
      clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }
  }, [token]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
    };
  }, []);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setError("");
    setSuccess(false);

    if (!token) {
      setError("Missing reset token. Please request a new reset link.");
      return;
    }

    const issue = getPasswordIssue(password);
    if (issue) {
      setError(issue);
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    if (!turnstileToken) {
      setError("Please complete the captcha.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          newPassword: password,
          turnstileToken,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || "Failed to reset password.");
        // reset captcha token so user can retry cleanly
        setTurnstileToken(null);
        return;
      }

      setSuccess(true);

      // short friendly redirect after success
      redirectTimerRef.current = setTimeout(() => {
        router.replace("/(auth)/sign-in");
      }, 900);
    } catch (err) {
      console.error("RESET PASSWORD ERROR:", err);
      setError("Network error. Please try again.");
      setTurnstileToken(null);
    } finally {
      setLoading(false);
    }
  }

  const disableInputs = !token || loading || success;

  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <div className="w-[360px]">
        <h1 className="text-2xl font-bold mb-2 text-center">Reset Password</h1>
        <p className="text-sm text-slate-500 mb-6 text-center">
          Choose a new password for your account.
        </p>

        {!token && (
          <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3">
            <p className="text-red-700 text-sm">
              This reset link is missing a token. Please request a new reset
              link.
            </p>
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-3 rounded-2xl border border-green-200 bg-green-50 p-3">
            <p className="text-green-700 text-sm text-center">
              ✅ Password updated — redirecting to sign in…
            </p>
          </div>
        )}

        <form onSubmit={handleReset} className="flex flex-col gap-3">
          <div>
            <label className="sr-only" htmlFor="new-password">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              placeholder="New password"
              className="border p-3 rounded-2xl w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LEN}
              disabled={disableInputs}
              aria-invalid={!!password && !!passwordIssue}
            />
            {password && passwordIssue && (
              <p className="text-[11px] text-slate-500 mt-1">{passwordIssue}</p>
            )}
          </div>

          <div>
            <label className="sr-only" htmlFor="confirm-password">
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              placeholder="Confirm password"
              className="border p-3 rounded-2xl w-full"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LEN}
              disabled={disableInputs}
              aria-invalid={!!confirm && password !== confirm}
            />
            {confirm && password !== confirm && (
              <p className="text-[11px] text-slate-500 mt-1">
                Passwords do not match.
              </p>
            )}
          </div>

          <div className="mt-1">
            <Turnstile
              sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
              theme="light"
              onSuccess={(t) => setTurnstileToken(t)}
              onExpire={() => setTurnstileToken(null)}
              onError={() => setTurnstileToken(null)}
            />
            <p className="text-[11px] text-slate-500 mt-2">
              Complete the captcha, then click “Update Password”.
            </p>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="bg-blue-600 text-white px-4 py-3 rounded-2xl font-semibold
                       hover:bg-blue-500 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Updating..." : "Update Password"}
          </button>
        </form>

        <div className="mt-5 text-center">
          <Link href="/(auth)/sign-in" className="text-sm text-blue-600 underline">
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}