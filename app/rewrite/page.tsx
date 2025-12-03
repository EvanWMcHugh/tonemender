"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";
import Toast from "../components/Toast";

export default function RewritePage() {
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

  // ---------------------------------------------------------
  // HANDLE REWRITE
  // ---------------------------------------------------------
  async function handleRewrite() {
    setError("");
    setLimitReached(false);
    setResults({ soft: "", calm: "", clear: "" });
    setLoading(true);

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        setError("You must be logged in to use ToneMender.");
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
        soft: json.soft || "",
        calm: json.calm || "",
        clear: json.clear || "",
      });
    } catch (e) {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setToast("Copied!");
  }

  function useThis(text: string) {
    setMessage(text);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------------------------------------------------------
  // SAVE MESSAGE
  // ---------------------------------------------------------
  async function saveMessage(text: string, tone: "soft" | "calm" | "clear") {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;

    if (!user) {
      alert("You must be logged in to save messages.");
      return;
    }

    const { error } = await supabase.from("messages").insert({
      user_id: user.id,
      original: message,
      rewritten: text,
      tone,
    });

    if (error) {
      console.error(error);
      alert("Failed to save message.");
    } else {
      alert("Saved!");
    }
  }

  // ---------------------------------------------------------
  // UI
  // ---------------------------------------------------------
  return (
    <main className="max-w-2xl mx-auto p-5">
      <h1 className="text-3xl font-bold mb-5">Rewrite Your Message</h1>

      {limitReached && (
        <div className="mb-4 p-4 rounded bg-yellow-100 border border-yellow-300">
          <p className="font-semibold mb-2">
            You’ve used all 3 free rewrites for today.
          </p>
          <p className="mb-2 text-sm">
            Upgrade to ToneMender Pro to unlock unlimited rewrites.
          </p>
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
        <option value="partner">Romantic Partner</option>
        <option value="friend">Friend</option>
        <option value="family">Family</option>
        <option value="coworker">Coworker</option>
      </select>

      <button
        onClick={handleRewrite}
        disabled={loading || !message}
        className="bg-blue-600 text-white w-full p-3 mt-4 rounded disabled:bg-gray-400 flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            Processing...
          </>
        ) : (
          "Rewrite Message"
        )}
      </button>

      {results.soft && (
        <div className="mt-8 space-y-6">
          {(["soft", "calm", "clear"] as const).map((toneKey) => (
            <div
              key={toneKey}
              className="border p-4 rounded-lg bg-gray-50 shadow-sm"
            >
              <h2 className="text-xl font-semibold capitalize mb-2 text-blue-700">
                {toneKey} Version
              </h2>

              <p className="whitespace-pre-wrap">
                {results[toneKey] || "(no result)"}
              </p>

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => copyToClipboard(results[toneKey])}
                  className="border px-3 py-1 rounded"
                >
                  Copy
                </button>

                <button
                  onClick={() => useThis(results[toneKey])}
                  className="border px-3 py-1 rounded"
                >
                  Use This
                </button>

                <button
                  onClick={() => setMessage(results[toneKey])}
                  className="border px-3 py-1 rounded"
                >
                  Edit
                </button>

                <button
                  onClick={() => saveMessage(results[toneKey], toneKey)}
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