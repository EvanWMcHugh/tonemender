"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";

const Turnstile = dynamic(() => import("react-turnstile"), { ssr: false });

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    return Boolean(token) && Boolean(turnstileToken) && !loading;
  }, [token, turnstileToken, loading]);

  useEffect(() => {
    // If user changes password fields, keep captcha token (fine).
    // If link token changes, reset captcha token for safety.
    setTurnstileToken(null);
    setSuccess(false);
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (!token) {
      setError("Missing reset token. Please request a new reset link.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password.length > 200) {
      setError("Password is too long.");
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

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

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

      timeoutId = setTimeout(() => {
        router.replace("/sign-in");
      }, 700);
    } catch {
      setError("Network error. Please try again.");
      setTurnstileToken(null);
    } finally {
      setLoading(false);
      if (timeoutId) {
        // cleanup is handled by component unmount too, but safe here
      }
    }
  }

  // Clear any pending redirects if unmounted quickly
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    return () => {
      if (t) clearTimeout(t);
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <div className="w-[360px]">
        <h1 className="text-2xl font-bold mb-4 text-center">Reset Password</h1>

        {!token && (
          <p className="text-red-500 text-sm mb-2">
            This reset link is missing a token. Please request a new reset link.
          </p>
        )}

        {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

        {success && (
          <p className="text-green-600 text-sm mb-2 text-center">
            ✅ Password updated — redirecting to sign in…
          </p>
        )}

        <form onSubmit={handleReset} className="flex flex-col gap-3">
          <input
            type="password"
            placeholder="New password"
            className="border p-2 rounded"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            minLength={8}
            disabled={!token || loading}
          />

          <input
            type="password"
            placeholder="Confirm password"
            className="border p-2 rounded"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
            minLength={8}
            disabled={!token || loading}
          />

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
            className="bg-blue-600 text-white p-2 rounded disabled:opacity-60"
          >
            {loading ? "Updating..." : "Update Password"}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link href="/sign-in" className="text-sm text-blue-600 underline">
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}