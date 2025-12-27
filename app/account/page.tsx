"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

export default function AccountPage() {
  const router = useRouter();

  const [email, setEmail] = useState<string | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [stats, setStats] = useState({ today: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  // ➕ Change email state
  const [newEmail, setNewEmail] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailError, setEmailError] = useState("");

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/sign-in");
        return;
      }

      setEmail(data.user.email);

      const { data: profile } = await supabase
        .from("profiles")
        .select("is_pro")
        .eq("id", data.user.id)
        .single();

      if (profile?.is_pro) setIsPro(true);

      const todayStr = new Date().toISOString().split("T")[0];

      const { data: usage } = await supabase
        .from("rewrite_usage")
        .select("*")
        .eq("user_id", data.user.id);

      const today =
        usage?.filter((u) => u.created_at.startsWith(todayStr)).length || 0;

      setStats({ today, total: usage?.length || 0 });
      setLoading(false);
    }

    load();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  async function deleteAllMessages() {
    const ok = confirm("Delete ALL saved drafts? This cannot be undone.");
    if (!ok) return;

    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;

    await supabase.from("messages").delete().eq("user_id", user.user.id);
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

  const json = await res.json();

  if (!res.ok) {
    alert(json.error || "Failed to delete account.");
    return;
  }

  alert("Account deleted.");
  // Supabase session is now invalid; go home/landing
  router.push("/");
}

  async function openBillingPortal() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    const res = await fetch("/api/portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    const json = await res.json();
    if (json.url) window.location.href = json.url;
  }

  // ➕ Change email handler
  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailError("");
    setEmailMessage("");

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(newEmail)) {
      setEmailError("Please enter a valid email address");
      return;
    }

    const { error } = await supabase.auth.updateUser({ email: newEmail });
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
        className="mb-4 text-blue-600 underline"
      >
        ← Back to Home
      </button>

      <h1 className="text-3xl font-bold mb-6">Your Account</h1>

      {/* PROFILE */}
      <div className="border p-4 rounded mb-6 bg-white">
        <h2 className="text-xl font-semibold mb-2">Profile</h2>
        <p>
          <strong>Email:</strong> {email}
        </p>
        <p>
          <strong>Status:</strong> {isPro ? "🚀 Pro Member" : "Free User"}
        </p>

        {isPro && (
          <button
            onClick={openBillingPortal}
            className="mt-3 bg-purple-600 text-white px-4 py-2 rounded"
          >
            Manage Subscription
          </button>
        )}
      </div>

      {/* USAGE */}
      <div className="border p-4 rounded mb-6 bg-white">
        <h2 className="text-xl font-semibold mb-2">Usage</h2>
        <p>
          <strong>Rewrites Today:</strong> {stats.today}
        </p>
        <p>
          <strong>Total Rewrites:</strong> {stats.total}
        </p>
      </div>

      {/* SECURITY */}
      <div className="border p-4 rounded mb-6 bg-white">
        <h2 className="text-xl font-semibold mb-4">Security</h2>

        {/* ➕ Change Email */}
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
              className="border p-2 rounded flex-1"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
            <button
              type="submit"
              className="bg-green-600 text-white px-3 py-2 rounded"
            >
              Update
            </button>
          </div>
        </form>

        <button
          onClick={handleLogout}
          className="bg-gray-800 text-white px-4 py-2 rounded"
        >
          Logout
        </button>
      </div>

      {/* DANGER ZONE FIXED */}
      <div className="border p-4 rounded bg-white">
        <h2 className="text-xl font-semibold text-red-600 mb-3">Danger Zone</h2>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={deleteAllMessages}
            className="border border-red-500 text-red-600 px-4 py-2 rounded"
          >
            Delete All Messages
          </button>

          <button
            onClick={deleteAccount}
            className="bg-red-600 text-white px-4 py-2 rounded"
          >
            Delete Account
          </button>
        </div>
      </div>
    </main>
  );
}