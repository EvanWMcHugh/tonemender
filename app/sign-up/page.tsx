"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase"; // ✅ import supabase
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";

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

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) {
        router.replace("/page"); // redirect if already logged in
      }
    }
    checkSession();
  }, [router]);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // ✅ Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address");
      setLoading(false);
      return;
    }

    // ✅ Direct client-side signup
    const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    captchaToken,
    emailRedirectTo: "https://tonemender.com/check-email", // ✅ new correct key
  },
});

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // ✅ If user is immediately logged in (no email confirmation), redirect to main page
    if (data.user) {
      router.replace("/page");
    } else {
      // If email confirmation required, go to check-email page
      router.replace("/check-email");
    }

    setLoading(false);
    setCaptchaToken(null);
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

          <Turnstile
            sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
            theme="light"
            size="normal"
            onSuccess={(token) => setCaptchaToken(token)}
            onExpire={() => setCaptchaToken(null)}
            onError={() => setCaptchaToken(null)}
          />

          <button
            type="submit"
            disabled={loading}
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