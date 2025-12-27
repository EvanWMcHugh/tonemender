"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

const Turnstile = dynamic(() => import("react-turnstile"), { ssr: false });

const CAPTCHA_ALLOWLIST = new Set(["pro@tonemender.com", "free@tonemender.com"]);

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [showCaptcha, setShowCaptcha] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  // "signin" means: user clicked login and we’re waiting for captcha
  const [pendingAction, setPendingAction] = useState<null | "signin">(null);

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

  async function runSignIn() {
    setError("");
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (signInError) throw signInError;

      router.push("/"); // your logged-in route
    } catch (e: any) {
      setError(e?.message || "Sign in failed.");
      // If sign-in failed, you might want to let them retry captcha:
      // setShowCaptcha(false); setCaptchaToken(null); setPendingAction(null);
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

    // Allowlisted users bypass captcha entirely
    if (isAllowlisted) {
      await runSignIn();
      return;
    }

    // Not allowlisted: only show captcha AFTER click
    if (!captchaToken) {
      setPendingAction("signin");
      setShowCaptcha(true);
      return;
    }

    // If we already have a token (e.g. user completed captcha earlier), verify + sign in
    setLoading(true);
    try {
      await verifyTurnstile(captchaToken);
      await runSignIn();
    } catch (e: any) {
      setError(e?.message || "Captcha verification failed.");
      // Force a fresh captcha
      setCaptchaToken(null);
      setPendingAction("signin");
      setShowCaptcha(true);
    } finally {
      setLoading(false);
    }
  }

  async function onTurnstileVerify(token: string) {
    setCaptchaToken(token);

    // Auto-run the pending action right after captcha success
    if (pendingAction === "signin") {
      setLoading(true);
      setError("");
      try {
        await verifyTurnstile(token);
        await runSignIn();
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
      <h1>Sign in</h1>

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
          autoComplete="current-password"
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
          {loading ? "Signing in..." : "Login"}
        </button>
      </form>

      <p>
        Don’t have an account? <Link href="/sign-up">Sign up</Link>
      </p>
    </div>
  );
}