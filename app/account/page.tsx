"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import { isProReviewer } from "../../lib/reviewers";
import dynamic from "next/dynamic";

const Turnstile = dynamic(() => import("react-turnstile"), { ssr: false });

// ✅ Only these are excluded from captcha (match sign-in + API)
const CAPTCHA_BYPASS_EMAILS = new Set(["pro@tonemender.com", "free@tonemender.com"]);

type UsageStats = { today: number; total: number };

function getPacificDateString(date = new Date()) {
  // YYYY-MM-DD in America/Los_Angeles (matches your API reset logic)
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

  const [email, setEmail] = useState<string | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [stats, setStats] = useState<UsageStats>({ today: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  // Change email state
  const [newEmail, setNewEmail] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

  // Turnstile state for email change
  const [showEmailCaptcha, setShowEmailCaptcha] = useState(false);
  const [emailCaptchaToken, setEmailCaptchaToken] = useState<string | null>(null);

  const todayStr = useMemo(() => getPacificDateString(), []);
  const normalizedCurrentEmail = useMemo(() => normalizeEmail(email || ""), [email]);
  const isBypassEmail = useMemo(
    () => (normalizedCurrentEmail ? CAPTCHA_BYPASS_EMAILS.has(normalizedCurrentEmail) : false),
    [normalizedCurrentEmail]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData.session?.user;

        if (!user) {
          router.replace("/sign-in");
          return;
        }

        if (cancelled) return;

        setEmail(user.email ?? null);

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("is_pro")
          .eq("id", user.id)
          .single();

        if (!cancelled) {
          const pro = Boolean(profile?.is_pro) || isProReviewer(user.email ?? null);
          setIsPro(pro);

          if (profileError) {
            // Not fatal; just log it
            console.warn("PROFILE LOAD WARNING:", profileError);
          }
        }

        // Stats: only pull created_at to reduce payload
        const { data: usageRows, error: usageError } = await supabase
          .from("rewrite_usage")
          .select("created_at")
          .eq("user_id", user.id);

        if (cancelled) return;

        if (usageError) {
          console.warn("USAGE LOAD WARNING:", usageError);
          setStats({ today: 0, total: 0 });
        } else {
          const total = usageRows?.length ?? 0;

          // created_at is ISO string; take YYYY-MM-DD and compare to Pacific day string
          const today = (usageRows ?? []).filter((u: any) => {
            const created = typeof u?.created_at === "string" ? u.created_at : "";
            const utcDay = created.split("T")[0]; // YYYY-MM-DD
            return utcDay === todayStr;
          }).length;

          setStats({ today, total });
        }
      } catch (err) {
        console.error("ACCOUNT LOAD ERROR:", err);
        router.replace("/sign-in");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    // Keep UI email in sync after auth state changes
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user;
      if (!user) {
        router.replace("/sign-in");
        return;
      }
      setEmail(user.email ?? null);
      setIsPro((prev) => prev || isProReviewer(user.email ?? null));
    });

    return () => {
      cancelled = true;
      listener?.subscription?.unsubscribe();
    };
  }, [router, todayStr]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/sign-in");
  }

  async function deleteAllMessages() {
    const ok = confirm("Delete ALL saved drafts? This cannot be undone.");
    if (!ok) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return;

    const { error } = await supabase.from("messages").delete().eq("user_id", user.id);

    if (error) {
      console.error("DELETE ALL MESSAGES ERROR:", error);
      alert("Failed to delete drafts.");
      return;
    }

    alert("All drafts deleted.");
    location.reload();
  }

  async function deleteAccount() {
    const ok = confirm("Delete your ENTIRE account permanently?");
    if (!ok) return;

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      alert("You must be logged in.");
      return;
    }

    const res = await fetch("/api/delete-account", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });

    let json: any = {};
    try {
      json = await res.json();
    } catch {
      json = {};
    }

    if (!res.ok) {
      alert(json?.error || "Failed to delete account.");
      return;
    }

    alert("Account deleted.");
    router.replace("/landing");
  }

  async function openBillingPortal() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      alert("You must be logged in.");
      return;
    }

    const res = await fetch("/api/portal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });

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
    setEmailMessage("");

    const candidate = normalizeEmail(newEmail);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    if (!emailRegex.test(candidate)) {
      setEmailError("Please enter a valid email address");
      return;
    }

    // Optional: prevent “changing” to the same email
    if (email && normalizeEmail(email) === candidate) {
      setEmailError("That is already your current email.");
      return;
    }

    // If not bypass, require captcha token (show widget on first click)
    if (!isBypassEmail && !emailCaptchaToken) {
      setShowEmailCaptcha(true);
      return;
    }

    setEmailLoading(true);

    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;

      if (!accessToken) {
        setEmailError("You must be logged in.");
        return;
      }

      const resp = await fetch("/api/auth/request-email-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: accessToken,
          newEmail: candidate,
          turnstileToken: isBypassEmail ? "bypass" : emailCaptchaToken,
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

      // ✅ Route to your new generalized check-email screen
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
          <strong>Email:</strong> {email}
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
          {emailMessage && <p className="text-green-600 text-sm mb-1">{emailMessage}</p>}

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
              {emailLoading ? "Sending…" : showEmailCaptcha && !isBypassEmail ? "Verify…" : "Update"}
            </button>
          </div>

          {!isBypassEmail && showEmailCaptcha && (
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