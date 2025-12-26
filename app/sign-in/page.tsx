"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ALL_REVIEWER_EMAILS } from "../../lib/reviewers";

const Turnstile = dynamic(() => import("react-turnstile"), {
  ssr: false,
});

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [isReviewerEmail, setIsReviewerEmail] = useState(false);
  const [showCaptcha, setShowCaptcha] = useState(false);

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) {
        router.replace("/page"); // redirect if already logged in
      }
    }
    checkSession();
  }, [router]);

  useEffect(() => {
    const isReviewer = ALL_REVIEWER_EMAILS.includes(email.trim().toLowerCase());
    setIsReviewerEmail(isReviewer);

    // Always reset captcha when email changes
    setShowCaptcha(false);
    setCaptchaToken(null);
  }, [email]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const normalizedEmail = email.trim().toLowerCase();
    const isReviewer = ALL_REVIEWER_EMAILS.includes(normalizedEmail);

    if (!isReviewer && !captchaToken) {
      setShowCaptcha(true);
      return;
    }

    setLoading(true);

    // ✅ Direct client-side login
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
      options: {
        captchaToken: isReviewer ? undefined : captchaToken,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // ✅ Redirect after successful login
    router.replace("/page");
    setLoading(false);
    setCaptchaToken(null);
    setShowCaptcha(false);
  }

  async function handleResetPassword() {
    const normalizedEmail = email.trim().toLowerCase();
    const isReviewer = ALL_REVIEWER_EMAILS.includes(normalizedEmail);

    if (!isReviewer && !captchaToken) {
      setShowCaptcha(true);
      return;
    }

    if (!email) {
      setError("Enter your email first.");
      return;
    }

    setLoading(true);
    setError("");

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://tonemender.com/reset-password",
      captchaToken: isReviewer ? undefined : captchaToken,
    });

    setLoading(false);
    setResetSent(true);
    setCaptchaToken(null);
    setShowCaptcha(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <div className="w-[360px]">
        <Link
          href="/landing"
          className="inline-block mb-4 text-sm text-slate-600 hover:underline"
        >
          ← Back to home
        </Link>
        <h1 className="text-2xl font-bold mb-4 text-center">Sign In</h1>

        {error && <p className="text-red-500">{error}</p>}

        <form onSubmit={handleLogin} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email"
            className="border p-2 rounded"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            className="border p-2 rounded"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {!isReviewerEmail && showCaptcha && (
            <Turnstile
              sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
              theme="light"
              onSuccess={(token) => setCaptchaToken(token)}
              onExpire={() => setCaptchaToken(null)}
              onError={() => setCaptchaToken(null)}
            />
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white p-2 rounded"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <button
          type="button"
          onClick={handleResetPassword}
          disabled={loading}
          className="mt-3 text-sm text-blue-600 underline text-center w-full"
        >
          Forgot your password?
        </button>

        {resetSent && (
          <p className="mt-2 text-sm text-green-600 text-center">
            ✅ Password reset email sent
          </p>
        )}

        <p className="mt-4 text-center text-sm">
          Don’t have an account?{" "}
          <a href="/sign-up" className="text-blue-600 underline">
            Sign Up
          </a>
        </p>
      </div>
    </main>
  );
}