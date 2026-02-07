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

type PendingAction = null | "signup";

export default function SignUpPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [showCaptcha, setShowCaptcha] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const normalizedEmail = useMemo(() => normalizeEmail(email), [email]);
  const isBypassEmail = useMemo(
    () => (normalizedEmail ? CAPTCHA_BYPASS_EMAILS.has(normalizedEmail) : false),
    [normalizedEmail]
  );

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const resp = await fetch("/api/me", { method: "GET" });
        const json = await resp.json().catch(() => ({ user: null }));
        if (!cancelled && json?.user?.id) router.replace("/");
      } catch {}
    }

    checkSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // Reset captcha when email changes
  useEffect(() => {
    setShowCaptcha(false);
    setPendingAction(null);
    setError("");
  }, [normalizedEmail]);

  function cleanupCaptchaState() {
    setShowCaptcha(false);
    setPendingAction(null);
  }

  async function doSignUp(withToken: string | null) {
    setError("");

    if (!normalizedEmail) {
      setError("Enter your email.");
      return;
    }

    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password.length > 200) {
      setError("Password is too long.");
      return;
    }

    if (loading) return;

    // show captcha only after click
    if (!isBypassEmail && !withToken) {
      setPendingAction("signup");
      setShowCaptcha(true);
      return;
    }

    setLoading(true);
    try {
      const resp = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          // server bypasses based on email; for non-bypass we must pass the token
          captchaToken: isBypassEmail ? null : withToken,
        }),
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok || !json?.ok) {
        throw new Error(json?.error || "Sign up failed");
      }

      cleanupCaptchaState();

      // ✅ Match CheckEmailPage types
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
    await doSignUp(null);
  }

  async function handleCaptchaSuccess(token: string) {
    if (pendingAction !== "signup") return;
    if (loading) return;
    await doSignUp(token);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <div className="w-[360px]">
        <Link href="/landing" className="inline-block mb-4 text-sm text-slate-600 hover:underline">
          ← Back to home
        </Link>

        <h1 className="text-2xl font-bold mb-4 text-center">Sign Up</h1>

        {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

        <form onSubmit={handleSignUp} className="flex flex-col gap-3">
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
            autoComplete="new-password"
            minLength={8}
            disabled={loading}
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
            {loading ? "Creating account..." : "Sign Up"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm">
          Already have an account?{" "}
          <Link href="/sign-in" className="text-blue-600 underline">
            Sign In
          </Link>
        </p>
      </div>
    </main>
  );
}