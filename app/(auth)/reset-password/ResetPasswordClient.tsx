"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";

const Turnstile = dynamic(() => import("react-turnstile"), { ssr: false });

const MIN_PASSWORD_LEN = 8;
const MAX_PASSWORD_LEN = 200;

function getPasswordIssue(password: string) {
  if (password.length < MIN_PASSWORD_LEN) {
    return `Password must be at least ${MIN_PASSWORD_LEN} characters.`;
  }

  if (password.length > MAX_PASSWORD_LEN) {
    return "Password is too long.";
  }

  return "";
}

export default function ResetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const passwordIssue = useMemo(() => getPasswordIssue(password), [password]);

  const passwordsMatch = useMemo(() => {
    return password.length > 0 && password === confirm;
  }, [password, confirm]);

  const canSubmit = useMemo(() => {
    if (!token) return false;
    if (!turnstileToken) return false;
    if (loading) return false;
    if (passwordIssue) return false;
    if (!passwordsMatch) return false;
    return true;
  }, [token, turnstileToken, loading, passwordIssue, passwordsMatch]);

  useEffect(() => {
    setTurnstileToken(null);
    setSuccess(false);
    setError("");

    if (redirectTimerRef.current) {
      clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }
  }, [token]);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
    };
  }, []);

  async function handleReset(e: React.FormEvent<HTMLFormElement>) {
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
        cache: "no-store",
        body: JSON.stringify({
          token,
          newPassword: password,
          turnstileToken,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error || "Failed to reset password.");
        setTurnstileToken(null);
        return;
      }

      setSuccess(true);

      redirectTimerRef.current = setTimeout(() => {
        router.replace("/sign-in");
      }, 900);
    } catch (err: unknown) {
      console.error("RESET_PASSWORD_ERROR", err);
      setError("Network error. Please try again.");
      setTurnstileToken(null);
    } finally {
      setLoading(false);
    }
  }

  const disableInputs = !token || loading || success;

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-lg sm:p-8">
        <h1 className="mb-2 text-center text-2xl font-bold">Reset Password</h1>
        <p className="mb-6 text-center text-sm text-slate-500">
          Choose a new password for your account.
        </p>

        {!token && (
          <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-700">
              This reset link is missing a token. Please request a new reset link.
            </p>
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-3 rounded-2xl border border-green-200 bg-green-50 p-3">
            <p className="text-center text-sm text-green-700">
              ✅ Password updated — redirecting to sign in…
            </p>
          </div>
        )}

        <form onSubmit={handleReset} className="flex flex-col gap-3">
          <div>
            <label htmlFor="new-password" className="sr-only">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              placeholder="New password"
              className="w-full rounded-2xl border p-3"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LEN}
              disabled={disableInputs}
              aria-invalid={Boolean(password && passwordIssue)}
            />
            {password && passwordIssue && (
              <p className="mt-1 text-[11px] text-slate-500">{passwordIssue}</p>
            )}
          </div>

          <div>
            <label htmlFor="confirm-password" className="sr-only">
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              placeholder="Confirm password"
              className="w-full rounded-2xl border p-3"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LEN}
              disabled={disableInputs}
              aria-invalid={Boolean(confirm && password !== confirm)}
            />
            {confirm && password !== confirm && (
              <p className="mt-1 text-[11px] text-slate-500">
                Passwords do not match.
              </p>
            )}
          </div>

          <div className="mt-1">
            <Turnstile
              sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
              theme="light"
              onSuccess={(nextToken) => setTurnstileToken(nextToken)}
              onExpire={() => setTurnstileToken(null)}
              onError={() => setTurnstileToken(null)}
            />
            <p className="mt-2 text-[11px] text-slate-500">
              Complete the captcha, then click “Update Password”.
            </p>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Updating..." : "Update Password"}
          </button>
        </form>

        <div className="mt-5 text-center">
          <Link href="/sign-in" className="text-sm text-blue-600 underline">
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}