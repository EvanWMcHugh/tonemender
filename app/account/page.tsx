"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import { isProReviewer } from "../../lib/reviewers";

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

  const todayStr = useMemo(() => getPacificDateString(), []);

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
            // This is not perfect for Pacific vs UTC, but aligns with your existing approach
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

    return () => {
      cancelled = true;
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
    // Refresh stats/drafts view
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
        Authorization: `Bearer ${token}`, // header-first (your API supports this pattern)
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

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailError("");
    setEmailMessage("");

    const candidate = newEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    if (!emailRegex.test(candidate)) {
      setEmailError("Please enter a valid email address");
      return;
    }

    const { error } = await supabase.auth.updateUser({ email: candidate });

    if (error) {
      setEmailError(error.message);
      return;
    }

    setEmailMessage(
      "We sent a confirmation link to your new email. Please verify it to complete the change."
    );
    setNewEmail("");
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
          {emailMessage && (
            <p className="text-green-600 text-sm mb-1">{emailMessage}</p>
          )}

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
            />
            <button
              type="submit"
              className="bg-green-600 text-white px-3 py-2 rounded-xl hover:bg-green-500 transition"
            >
              Update
            </button>
          </div>
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