"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Some flows won't fire PASSWORD_RECOVERY immediately depending on how the link is opened.
    // We listen for auth events, but also allow the user to try once session is established.
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;

      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
        setError("");
      }

      // If user is signed in normally, send them to the app
      if (event === "SIGNED_IN" && session?.user) {
        router.replace("/");
      }
    });

    // Also check session on mount (covers some edge cases)
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      // If session exists here during recovery, allow reset
      if (data.session) setReady(true);
    })();

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (!ready) {
      setError("Preparing secure reset session. Please wait a moment.");
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
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setError(error.message);
        return;
      }

      setSuccess(true);

      // Give the UI a moment to show success, then send to sign-in
      setTimeout(() => {
        router.replace("/sign-in");
      }, 600);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <div className="w-[360px]">
        <h1 className="text-2xl font-bold mb-4 text-center">Reset Password</h1>

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
          />

          <button
            type="submit"
            disabled={loading}
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