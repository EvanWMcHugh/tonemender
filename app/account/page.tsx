"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isProReviewer } from "../../lib/reviewers";
import dynamic from "next/dynamic";

const Turnstile = dynamic(() => import("react-turnstile"), { ssr: false });

type UsageStats = { today: number; total: number };
type MeUser = { id: string; email: string; isPro?: boolean; planType?: string | null };

function getPacificDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export default function AccountPage() {
  const router = useRouter();

  const [user, setUser] = useState<MeUser | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [stats, setStats] = useState<UsageStats>({ today: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  // Change email
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

  // Turnstile for email change
  const [showEmailCaptcha, setShowEmailCaptcha] = useState(false);
  const [emailCaptchaToken, setEmailCaptchaToken] = useState<string | null>(null);

  const todayStr = useMemo(() => getPacificDateString(), []);
  const normalizedCurrentEmail = useMemo(
    () => normalizeEmail(user?.email || ""),
    [user?.email]
  );

  // Used to auto-submit after captcha completes (max polish UX)
  const pendingEmailSubmitRef = useRef(false);

  function resetEmailCaptchaState() {
    setEmailCaptchaToken(null);
    setShowEmailCaptcha(false);
    pendingEmailSubmitRef.current = false;
  }

  function validateEmailCandidate(candidate: string) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(candidate)) return "Please enter a valid email address.";
    if (normalizedCurrentEmail && candidate === normalizedCurrentEmail)
      return "That is already your current email.";
    return "";
  }

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        // Cookie-based auth
        const meResp = await fetch("/api/me", { method: "GET", signal: controller.signal });
        const meJson = await meResp.json().catch(() => ({ user: null }));
        const meUser: MeUser | null = meJson?.user ?? null;

        if (!meUser?.id) {
          router.replace("/sign-in");
          return;
        }

        setUser(meUser);

        const pro = Boolean(meUser.isPro) || isProReviewer(meUser.email ?? null);
        setIsPro(pro);

        // Usage stats via server route (cookie auth)
        const statsResp = await fetch(`/api/usage/stats?day=${encodeURIComponent(todayStr)}`, {
          method: "GET",
          signal: controller.signal,
        });
        const statsJson = await statsResp.json().catch(() => null);

        if (statsResp.ok && statsJson?.stats) {
          setStats(statsJson.stats);
        } else {
          setStats({ today: 0, total: 0 });
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          console.error("ACCOUNT LOAD ERROR:", err);
          router.replace("/sign-in");
        }
      } finally {
        setLoading(false);
      }
    }

    load();

    return () => controller.abort();
  }, [router, todayStr]);

  async function handleLogout() {
    try {
      await fetch("/api/auth/sign-out", { method: "POST" });
    } catch {}
    router.replace("/sign-in");
  }

  async function deleteAllMessages() {
    const ok = confirm("Delete ALL saved drafts? This cannot be undone.");
    if (!ok) return;

    const resp = await fetch("/api/messages/delete-all", { method: "POST" });
    if (!resp.ok) {
      alert("Failed to delete drafts.");
      return;
    }

    alert("All drafts deleted.");
    location.reload();
  }

  async function deleteAccount() {
    const ok = confirm("Delete your ENTIRE account permanently?");
    if (!ok) return;

    const res = await fetch("/api/delete-account", { method: "POST" });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(json?.error || "Failed to delete account.");
      return;
    }

    alert("Account deleted.");
    router.replace("/landing");
  }

  async function openBillingPortal() {
    const res = await fetch("/api/portal", { method: "POST" });
    const json = await res.json().catch(() => ({}));

    if (json?.url) {
      window.location.href = json.url;
      return;
    }

    alert("Could not open billing portal.");
  }

  async function submitEmailChange(candidate: string, turnstileToken: string) {
    setEmailLoading(true);
    try {
      const resp = await fetch("/api/auth/request-email-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail: candidate, turnstileToken }),
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        setEmailError(json?.error || "Failed to send confirmation email.");
        resetEmailCaptchaState();
        return;
      }

      setNewEmail("");
      resetEmailCaptchaState();
      router.push("/check-email?type=email-change");
    } catch (err: any) {
      setEmailError(err?.message || "Failed to send confirmation email.");
      resetEmailCaptchaState();
    } finally {
      setEmailLoading(false);
    }
  }

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailError("");

    const candidate = normalizeEmail(newEmail);
    const validation = validateEmailCandidate(candidate);
    if (validation) {
      setEmailError(validation);
      return;
    }

    // If we don't have captcha yet, show it and mark submit as pending (auto-submit on success).
    if (!emailCaptchaToken) {
      setShowEmailCaptcha(true);
      pendingEmailSubmitRef.current = true;
      return;
    }

    await submitEmailChange(candidate, emailCaptchaToken);
  }

  // If captcha succeeds and we had a pending submit, auto-submit (max polish UX).
  useEffect(() => {
    if (!emailCaptchaToken) return;
    if (!pendingEmailSubmitRef.current) return;
    if (emailLoading) return;

    const candidate = normalizeEmail(newEmail);
    const validation = validateEmailCandidate(candidate);
    if (validation) {
      setEmailError(validation);
      resetEmailCaptchaState();
      return;
    }

    // Fire and forget; function handles its own loading state.
    submitEmailChange(candidate, emailCaptchaToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailCaptchaToken]);

  if (loading) return <p className="p-5">Loading...</p>;
  if (!user?.id) return null;

  const candidateNormalized = normalizeEmail(newEmail);
  const emailValidation = newEmail ? validateEmailCandidate(candidateNormalized) : "";
  const emailSubmitDisabled =
    emailLoading ||
    !newEmail.trim() ||
    Boolean(emailValidation) ||
    (showEmailCaptcha && !emailCaptchaToken);

  return (
    <main className="max-w-xl mx-auto p-6">
      <button
        onClick={() => router.push("/")}
        className="mb-4 text-sm text-slate-600 hover:underline"
      >
        ← Back to Home
      </button>

      <h1 className="text-3xl font-bold mb-6">Your Account</h1>

      {/* PROFILE */}
      <div className="border p-4 rounded-2xl mb-6 bg-white shadow-sm">
        <h2 className="text-xl font-semibold mb-2">Profile</h2>

        <p className="text-sm">
          <strong>Email:</strong> {user.email}
        </p>
        <p className="text-sm mt-1">
          <strong>Status:</strong> {isPro ? "🚀 Pro Member" : "Free User"}
        </p>

        {isPro && (
          <button
            onClick={openBillingPortal}
            className="mt-3 bg-purple-600 text-white px-4 py-2 rounded-xl hover:bg-purple-500 transition"
          >
            Manage Subscription
          </button>
        )}
      </div>

      {/* USAGE */}
      <div className="border p-4 rounded-2xl mb-6 bg-white shadow-sm">
        <h2 className="text-xl font-semibold mb-2">Usage</h2>
        <p className="text-sm">
          <strong>Rewrites Today:</strong> {stats.today}
        </p>
        <p className="text-sm mt-1">
          <strong>Total Rewrites:</strong> {stats.total}
        </p>
      </div>

      {/* SECURITY */}
      <div className="border p-4 rounded-2xl mb-6 bg-white shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Security</h2>

        {/* Change Email */}
        <form onSubmit={handleChangeEmail} className="mb-4" aria-busy={emailLoading}>
          <p className="font-medium mb-2">Change Email</p>

          {emailError && <p className="text-red-500 text-sm mb-1">{emailError}</p>}
          {!emailError && emailValidation && (
            <p className="text-red-500 text-sm mb-1">{emailValidation}</p>
          )}

          <div className="flex gap-2">
            <input
              type="email"
              placeholder="New email address"
              className="border p-2 rounded-xl flex-1"
              value={newEmail}
              onChange={(e) => {
                setNewEmail(e.target.value);
                setEmailError("");
                // Any edit should invalidate any previously solved captcha token
                setEmailCaptchaToken(null);
                pendingEmailSubmitRef.current = false;
              }}
              required
              autoComplete="email"
              inputMode="email"
              disabled={emailLoading}
            />

            <button
              type="submit"
              disabled={emailSubmitDisabled}
              className="bg-green-600 text-white px-3 py-2 rounded-xl hover:bg-green-500 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {emailLoading ? "Sending…" : showEmailCaptcha ? "Verify…" : "Update"}
            </button>
          </div>

          {showEmailCaptcha && (
            <div className="mt-3">
              <Turnstile
                sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
                theme="light"
                onSuccess={(t) => setEmailCaptchaToken(t)}
                onExpire={() => setEmailCaptchaToken(null)}
                onError={() => setEmailCaptchaToken(null)}
              />
              <p className="text-[11px] text-slate-500 mt-2">
                Complete the captcha to continue. We’ll submit automatically when it’s done.
              </p>
              <button
                type="button"
                onClick={resetEmailCaptchaState}
                className="mt-2 text-xs text-slate-600 hover:underline"
                disabled={emailLoading}
              >
                Cancel
              </button>
            </div>
          )}

          <p className="text-[11px] text-slate-500 mt-2">
            After confirming, you may need to log in again using the new email.
          </p>
        </form>

        <button
          onClick={handleLogout}
          className="bg-gray-800 text-white px-4 py-2 rounded-xl hover:bg-gray-700 transition"
        >
          Logout
        </button>
      </div>

      {/* DANGER ZONE */}
      <div className="border p-4 rounded-2xl bg-white shadow-sm">
        <h2 className="text-xl font-semibold text-red-600 mb-3">Danger Zone</h2>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={deleteAllMessages}
            className="border border-red-500 text-red-600 px-4 py-2 rounded-xl hover:bg-red-50 transition"
          >
            Delete All Messages
          </button>

          <button
            onClick={deleteAccount}
            className="bg-red-600 text-white px-4 py-2 rounded-xl hover:bg-red-500 transition"
          >
            Delete Account
          </button>
        </div>
      </div>
    </main>
  );
}