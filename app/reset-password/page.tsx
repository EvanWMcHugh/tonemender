"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [loading, setLoading] = useState(false);

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

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Failed to reset password.");
        return;
      }

      setSuccess(true);

      // Give the UI a moment to show success, then send to sign-in
      setTimeout(() => {
        router.replace("/sign-in");
      }, 600);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

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

          <button
            type="submit"
            disabled={loading || !token}
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