"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isProReviewer } from "../../lib/reviewers";
import dynamic from "next/dynamic";

const Turnstile = dynamic(() => import("react-turnstile"), { ssr: false });

type UsageStats = { today: number; total: number };

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

type MeUser = { id: string; email: string; isPro?: boolean; planType?: string | null };

export default function AccountPage() {
  const router = useRouter();

  const [user, setUser] = useState<MeUser | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [stats, setStats] = useState<UsageStats>({ today: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  // Change email state
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

  // Turnstile state for email change
  const [showEmailCaptcha, setShowEmailCaptcha] = useState(false);
  const [emailCaptchaToken, setEmailCaptchaToken] = useState<string | null>(null);

  const todayStr = useMemo(() => getPacificDateString(), []);
  const normalizedCurrentEmail = useMemo(() => normalizeEmail(user?.email || ""), [user?.email]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // ✅ Custom session-based auth
        const meResp = await fetch("/api/me", { method: "GET" });
        const meJson = await meResp.json().catch(() => ({ user: null }));
        const meUser: MeUser | null = meJson?.user ?? null;

        if (!meUser?.id) {
          router.replace("/sign-in");
          return;
        }

        if (cancelled) return;

        setUser(meUser);

        const pro = Boolean(meUser.isPro) || isProReviewer(meUser.email ?? null);
        setIsPro(pro);

        // ✅ Usage stats fetched via server route (cookie auth)
        const statsResp = await fetch(`/api/usage/stats?day=${encodeURIComponent(todayStr)}`, {
          method: "GET",
        });
        const statsJson = await statsResp.json().catch(() => null);

        if (!cancelled && statsResp.ok && statsJson?.stats) {
          setStats(statsJson.stats);
        } else if (!cancelled) {
          setStats({ today: 0, total: 0 });
        }
      } catch (err) {
        console.error("ACCOUNT LOAD ERROR:", err);
        router.replace("/sign-in");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
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

  function resetEmailCaptchaState() {
    setEmailCaptchaToken(null);
    setShowEmailCaptcha(false);
  }

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailError("");

    const candidate = normalizeEmail(newEmail);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    if (!emailRegex.test(candidate)) {
      setEmailError("Please enter a valid email address");
      return;
    }

    if (user?.email && normalizeEmail(user.email) === candidate) {
      setEmailError("That is already your current email.");
      return;
    }

    if (!emailCaptchaToken) {
      setShowEmailCaptcha(true);
      return;
    }

    setEmailLoading(true);

    try {
      const resp = await fetch("/api/auth/request-email-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newEmail: candidate,
          turnstileToken: emailCaptchaToken,
        }),
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

  if (loading) return <p className="p-5">Loading...</p>;

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
          <strong>Email:</strong> {user?.email ?? ""}
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
        <form onSubmit={handleChangeEmail} className="mb-4">
          <p className="font-medium mb-2">Change Email</p>

          {emailError && <p className="text-red-500 text-sm mb-1">{emailError}</p>}

          <div className="flex gap-2">
            <input
              type="email"
              placeholder="New email address"
              className="border p-2 rounded-xl flex-1"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
              autoComplete="email"
              inputMode="email"
              disabled={emailLoading}
            />
            <button
              type="submit"
              disabled={emailLoading}
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
                Complete the captcha, then click Update again.
              </p>
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