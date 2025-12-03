"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Toast from "../components/Toast";

export default function RewritePage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  const [message, setMessage] = useState("");
  const [recipient, setRecipient] = useState("partner");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [limitReached, setLimitReached] = useState(false);

  const [results, setResults] = useState({
    soft: "",
    calm: "",
    clear: "",
  });

  const [toast, setToast] = useState("");

  // AUTH CHECK
  useEffect(() => {
    let mounted = true;

    async function check() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      if (data.session) {
        setLoggedIn(true);
        setReady(true);
        return;
      }

      setTimeout(async () => {
        const { data: retry } = await supabase.auth.getSession();
        if (!mounted) return;

        if (retry.session) {
          setLoggedIn(true);
          setReady(true);
        } else {
          router.replace("/sign-in");
        }
      }, 300);
    }

    check();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setLoggedIn(!!session);
      }
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  if (!ready) return <main className="p-8 text-center">Checking...</main>;
  if (!loggedIn) return null;

  // ---------------------------
  // REWRITE MESSAGE
  // ---------------------------
  async function handleRewrite() {
    setError("");
    setLimitReached(false);
    setResults({ soft: "", calm: "", clear: "" });
    setLoading(true);

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        setError("You must be logged in.");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, message, recipient }),
      });

      const json = await res.json();

      if (res.status === 429) {
        setLimitReached(true);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError(json.error || "Something went wrong.");
        setLoading(false);
        return;
      }

      setResults({
        soft: json.soft,
        calm: json.calm,
        clear: json.clear,
      });
    } finally {
      setLoading(false);
    }
  }

  // SAVE MESSAGE
  async function saveMessage(text: string, tone: "soft" | "calm" | "clear") {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;

    if (!user) return alert("Must be logged in.");

    const { error } = await supabase.from("messages").insert({
      user_id: user.id,
      original: message,
      soft: results.soft,
      calm: results.calm,
      clear: results.clear,
      tone,
    });

    if (error) alert("Failed to save.");
    else alert("Saved!");
  }

  return (
    <main className="max-w-2xl mx-auto p-5">

      {/* BACK BUTTON */}
      <Link
        href="/"
        className="inline-block mb-4 bg-gray-200 px-4 py-2 rounded"
      >
        ← Back
      </Link>

      <h1 className="text-3xl font-bold mb-5">Rewrite Your Message</h1>

      {limitReached && (
        <div className="mb-4 p-4 rounded bg-yellow-100 border border-yellow-300">
          <p className="font-semibold mb-2">You've reached your free limit.</p>
          <a
            href="/upgrade"
            className="inline-block bg-purple-600 text-white px-4 py-2 rounded text-sm"
          >
            Upgrade to Pro
          </a>
        </div>
      )}

      {error && <p className="text-red-500 mb-3">{error}</p>}

      <textarea
        className="border p-3 w-full rounded min-h-[120px]"
        placeholder="Paste your message..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />

      <select
        className="border p-2 rounded mt-3 w-full"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
      >
        <option value="partner">Partner</option>
        <option value="friend">Friend</option>
        <option value="family">Family</option>
        <option value="coworker">Coworker</option>
      </select>

      <button
        onClick={handleRewrite}
        disabled={loading || !message}
        className="bg-blue-600 text-white w-full p-3 mt-4 rounded"
      >
        {loading ? "Working…" : "Rewrite Message"}
      </button>

      {results.soft && (
        <div className="mt-8 space-y-6">
          {(["soft", "calm", "clear"] as const).map((tone) => (
            <div key={tone} className="border p-4 rounded bg-gray-50">
              <h2 className="text-xl font-semibold mb-2 capitalize">
                {tone} Version
              </h2>

              <p className="whitespace-pre-wrap">{results[tone]}</p>

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => navigator.clipboard.writeText(results[tone])}
                  className="border px-3 py-1 rounded"
                >
                  Copy
                </button>

                <button
                  onClick={() => setMessage(results[tone])}
                  className="border px-3 py-1 rounded"
                >
                  Edit
                </button>

                <button
                  onClick={() => saveMessage(results[tone], tone)}
                  className="border px-3 py-1 rounded bg-green-600 text-white"
                >
                  Save
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && <Toast text={toast} />}
    </main>
  );
}