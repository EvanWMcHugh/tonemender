"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

const Turnstile = dynamic(() => import("react-turnstile"), { ssr: false });

const CAPTCHA_ALLOWLIST = new Set(["pro@tonemender.com", "free@tonemender.com"]);

export default function SignUpPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [showCaptcha, setShowCaptcha] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<null | "signup">(null);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const isAllowlisted = CAPTCHA_ALLOWLIST.has(normalizedEmail);

  async function verifyTurnstile(token: string) {
    const res = await fetch("/api/turnstile/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, email: normalizedEmail }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      throw new Error(data?.error || "Captcha verification failed. Please try again.");
    }
  }

  async function runSignUp() {
    setError("");
    setLoading(true);
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        // options: { emailRedirectTo: `${location.origin}/confirm` } // if you use it
      });
      if (signUpError) throw signUpError;

      // If you require email confirmation, route to your “check email” page
      router.push("/check-email");
    } catch (e: any) {
      setError(e?.message || "Sign up failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!normalizedEmail || !password) {
      setError("Please enter your email and password.");
      return;
    }

    if (isAllowlisted) {
      await runSignUp();
      return;
    }

    if (!captchaToken) {
      setPendingAction("signup");
      setShowCaptcha(true);
      return;
    }

    setLoading(true);
    try {
      await verifyTurnstile(captchaToken);
      await runSignUp();
    } catch (e: any) {
      setError(e?.message || "Captcha verification failed.");
      setCaptchaToken(null);
      setPendingAction("signup");
      setShowCaptcha(true);
    } finally {
      setLoading(false);
    }
  }

  async function onTurnstileVerify(token: string) {
    setCaptchaToken(token);

    if (pendingAction === "signup") {
      setLoading(true);
      setError("");
      try {
        await verifyTurnstile(token);
        await runSignUp();
      } catch (e: any) {
        setError(e?.message || "Captcha verification failed.");
        setCaptchaToken(null);
      } finally {
        setLoading(false);
        setPendingAction(null);
      }
    }
  }

  return (
    <div>
      <h1>Sign up</h1>

      <form onSubmit={handleSubmit}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          type="email"
          autoComplete="email"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
          autoComplete="new-password"
        />

        {!isAllowlisted && showCaptcha && (
          <div style={{ marginTop: 12 }}>
            <Turnstile
              sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
              onVerify={onTurnstileVerify}
              onExpire={() => setCaptchaToken(null)}
              onError={() => setCaptchaToken(null)}
            />
          </div>
        )}

        {error && <p style={{ color: "red" }}>{error}</p>}

        <button type="submit" disabled={loading}>
          {loading ? "Creating account..." : "Sign up"}
        </button>
      </form>

      <p>
        Already have an account? <Link href="/sign-in">Sign in</Link>
      </p>
    </div>
  );
}