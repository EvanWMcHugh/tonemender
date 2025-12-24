"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ALL_REVIEWER_EMAILS } from "../../lib/reviewers";

const Turnstile = dynamic(() => import("react-turnstile"), {
  ssr: false,
});

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
const [showCaptcha, setShowCaptcha] = useState(false);
  const isReviewerEmail = ALL_REVIEWER_EMAILS.includes(email);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
setError("");

if (!isReviewerEmail && !captchaToken) {
  setShowCaptcha(true);
  return;
}

    // ✅ Email validation (blocks tonetest123@, user@gmail, etc.)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/auth/sign-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
  email,
  password,
  captchaToken: isReviewerEmail ? null : captchaToken,
}),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Signup failed");
      setLoading(false);
      return;
    }

    router.replace("/check-email");
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
        <h1 className="text-2xl font-bold mb-4 text-center">Create Account</h1>

        {error && <p className="text-red-500 mb-2">{error}</p>}

        <form onSubmit={handleSignup} className="flex flex-col gap-3">
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
    size="normal"
    onSuccess={(token) => setCaptchaToken(token)}
    onExpire={() => setCaptchaToken(null)}
    onError={() => setCaptchaToken(null)}
  />
)}

          <button
  type="submit"
  disabled={loading || (!captchaToken && !isReviewerEmail)}
  className="bg-green-600 text-white p-2 rounded"
>
            {loading ? "Creating..." : "Sign Up"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm">
          Already have an account?{" "}
          <a href="/sign-in" className="text-blue-600 underline">
            Sign In
          </a>
        </p>
      </div>
    </main>
  );
}