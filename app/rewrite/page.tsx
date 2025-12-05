"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Toast from "../components/Toast";
import html2canvas from "html2canvas";

export default function RewritePage() {
  const router = useRouter();

  // Auth state
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  // track PRO status
  const [isPro, setIsPro] = useState(false);

  // Rewrite state
  const [message, setMessage] = useState("");
  const [recipient, setRecipient] = useState("");
  const [tone, setTone] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [limitReached, setLimitReached] = useState(false);

  const [results, setResults] = useState({
    soft: "",
    calm: "",
    clear: "",
  });

  const [toneScore, setToneScore] = useState<number | null>(null);
  const [emotion, setEmotion] = useState("");

  const [toast, setToast] = useState("");

  // For Before/After share card
  const [originalForCard, setOriginalForCard] = useState("");
  const [rewrittenForCard, setRewrittenForCard] = useState("");
  const shareCardRef = useRef<HTMLDivElement | null>(null);

  // ---------------------------------------------------------
  // AUTH CHECK + FETCH PRO STATUS
  // ---------------------------------------------------------
  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const { data } = await supabase.auth.getSession();

      if (!mounted) return;

      if (data.session) {
        setLoggedIn(true);
        setReady(true);

        const user = data.session.user;

        const { data: profile } = await supabase
          .from("profiles")
          .select("is_pro")
          .eq("id", user.id)
          .single();

        setIsPro(profile?.is_pro === true);
        return;
      }

      setTimeout(async () => {
        const { data: retry } = await supabase.auth.getSession();

        if (!mounted) return;

        if (retry.session) {
          setLoggedIn(true);
          setReady(true);

          const user = retry.session.user;

          const { data: profile } = await supabase
            .from("profiles")
            .select("is_pro")
            .eq("id", user.id)
            .single();

          setIsPro(profile?.is_pro === true);
        } else {
          router.replace("/sign-in");
        }
      }, 300);
    }

    checkSession();

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

  if (!ready) {
    return <main className="p-8 text-center">Checking authentication…</main>;
  }

  if (!loggedIn) return null;

  // ---------------------------------------------------------
  // HANDLE REWRITE
  // ---------------------------------------------------------
  async function handleRewrite() {
    setError("");
    setLimitReached(false);
    setToneScore(null);
    setEmotion("");
    setResults({ soft: "", calm: "", clear: "" });
    setLoading(true);

    const trimmedMessage = message.trim();

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        setError("You must be logged in to use ToneMender.");
        setLoading(false);
        return;
      }

      if (!trimmedMessage) {
        setError("Please paste a message to rewrite.");
        setLoading(false);
        return;
      }

      const finalRecipient = isPro ? recipient : "default";
      const finalTone = isPro ? tone : "default";

      const res = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          message: trimmedMessage,
          recipient: finalRecipient,
          tone: finalTone,
        }),
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

      const newResults = {
        soft: json.soft?.trim() || "",
        calm: json.calm?.trim() || "",
        clear: json.clear?.trim() || "",
      };

      setResults(newResults);

      // ⭐ NEW: Tone Score + Emotion
      setToneScore(json.tone_score ?? null);
      setEmotion(json.emotion_prediction || "");

      const chosenToneKey = isPro ? (finalTone === "default" ? "soft" : finalTone) : "soft";
      const chosenText =
        (newResults as any)[chosenToneKey] ||
        newResults.soft ||
        newResults.calm ||
        newResults.clear ||
        "";

      setOriginalForCard(trimmedMessage);
      setRewrittenForCard(chosenText);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------------------------
  // SAVE, COPY, USE
  // ---------------------------------------------------------
  function copyToClipboard(text: string) {
    if (!text) {
      setToast("Nothing to copy yet.");
      return;
    }
    navigator.clipboard.writeText(text);
    setToast("Copied!");
  }

  function useThis(text: string) {
    if (!text) return;
    setMessage(text);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveMessage(text: string, tone: "soft" | "calm" | "clear") {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;

    if (!user) {
      alert("You must be logged in to save messages.");
      return;
    }

    const insertData: any = {
      user_id: user.id,
      original: message,
      tone,
    };

    if (tone === "soft") insertData.soft_rewrite = text;
    if (tone === "calm") insertData.calm_rewrite = text;
    if (tone === "clear") insertData.clear_rewrite = text;

    const { error } = await supabase.from("messages").insert(insertData);

    if (error) {
      console.error("SAVE ERROR:", error);
      alert("Failed to save message.");
    } else {
      alert("Saved!");
    }
  }

  // ---------------------------------------------------------
  // SHARE HANDLERS (unchanged)
  // ---------------------------------------------------------
  async function shareApp() {
    const url = "https://tone13.vercel.app";

    try {
      if (navigator.share) {
        await navigator.share({
          title: "ToneMender",
          text: "I’m using ToneMender to rewrite texts more safely. Check it out:",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setToast("App link copied!");
      }
    } catch {}
  }

  async function shareRewrite() {
    const key = isPro ? tone || "soft" : "soft";
    const current = key ? (results as any)[key] : results.soft;

    if (!current) {
      setToast("Rewrite a message first.");
      return;
    }

    const shareText = `Before:\n${message.trim()}\n\nAfter:\n${current}\n\nWritten with ToneMender (https://tone13.vercel.app)`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "My ToneMender Rewrite",
          text: shareText,
        });
      } else {
        await navigator.clipboard.writeText(shareText);
        setToast("Rewrite copied to clipboard!");
      }
    } catch {}
  }

  async function shareBeforeAfterImage() {
    if (!shareCardRef.current) {
      setToast("Rewrite a message first.");
      return;
    }

    try {
      const canvas = await html2canvas(shareCardRef.current, {
        backgroundColor: "#f9fafb",
        scale: 2,
      });

      const dataUrl = canvas.toDataURL("image/png");
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], "tonemender-before-after.png", {
        type: "image/png",
      });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "ToneMender Before & After",
          text: "Before vs After using ToneMender",
        });
      } else {
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = "tonemender-before-after.png";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setToast("Before/After image downloaded!");
      }
    } catch (err) {
      console.error(err);
      setToast("Could not create share image. Try again.");
    }
  }

  // ---------------------------------------------------------
  // UI — FINAL RENDER
  // ---------------------------------------------------------
  const displayKey = isPro ? tone || "soft" : "soft";
  const displayText =
    (displayKey && (results as any)[displayKey]) || results.soft;

  return (
    <main className="max-w-2xl mx-auto p-5">
      <button
        onClick={() => router.push("/")}
        className="mb-4 text-blue-600 underline"
      >
        ← Back to Home
      </button>

      <h1 className="text-3xl font-bold mb-2">Rewrite Your Message</h1>
      <p className="text-sm text-gray-600 mb-4">
        Paste the message you’re worried about sending. ToneMender keeps your
        meaning but removes the heat so you don’t start a fight by accident.
      </p>

      <button onClick={shareApp} className="mb-5 border px-3 py-2 rounded text-sm">
        Share ToneMender
      </button>

      {limitReached && (
        <div className="mb-4 p-4 rounded bg-yellow-100 border border-yellow-300">
          <p className="font-semibold mb-2">
            You’ve used all 3 free rewrites for today.
          </p>
          <p className="mb-2 text-sm">
            Upgrade to ToneMender Pro to unlock tone control, relationship types,
            and unlimited rewrites.
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

      {/* Original Message */}
      <label className="block mb-2 text-sm font-medium text-gray-700">
        Your original message
      </label>
      <textarea
        className="border p-3 w-full rounded min-h-[120px]"
        placeholder='Example: "I’m so tired of you ignoring my texts."'
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />

      {/* Relationship dropdown */}
      <div className="mt-4">
        <label className="block mb-1 text-sm font-medium text-gray-700">
          Who is this message for?
        </label>
        <select
          className="border p-2 rounded w-full"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          disabled={!isPro}
        >
          <option value="" disabled>
            {isPro
              ? "Select Relationship Type"
              : "Pro Required: Relationship Type Locked"}
          </option>
          <option value="partner">Romantic Partner</option>
          <option value="friend">Friend</option>
          <option value="family">Family</option>
          <option value="coworker">Coworker</option>
        </select>
      </div>

      {/* Tone dropdown */}
      <div className="mt-4">
        <label className="block mb-1 text-sm font-medium text-gray-700">
          How do you want to sound?
        </label>
        <select
          className="border p-2 rounded w-full"
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          disabled={!isPro}
        >
          <option value="" disabled>
            {isPro ? "Select Tone Type" : "Pro Required: Tone Type Locked"}
          </option>
          <option value="soft">Soft & Gentle</option>
          <option value="calm">Calm & Neutral</option>
          <option value="clear">Clear & Direct</option>
        </select>
      </div>

      <button
        onClick={handleRewrite}
        disabled={loading || !message.trim() || (isPro && (!recipient || !tone))}
        className="bg-blue-600 text-white w-full p-3 mt-4 rounded disabled:bg-gray-400"
      >
        {loading ? "Processing…" : "Rewrite Message"}
      </button>

      {/* RESULT SECTION */}
      {displayText && (
        <div className="mt-10 space-y-6">
          {/* ⭐ NEW: Tone Score + Emotion Prediction ABOVE the result card */}
          {(toneScore !== null || emotion) && (
            <div className="space-y-4">
              {/* Tone Score Circle */}
              {toneScore !== null && (
                <div className="flex justify-center">
                  <div
                    className="w-24 h-24 rounded-full flex items-center justify-center text-xl font-bold"
                    style={{
                      background: "#e0f2fe",
                      border: "4px solid #38bdf8",
                      color: "#0369a1",
                    }}
                  >
                    {toneScore}
                  </div>
                </div>
              )}

              {/* Emotion Prediction */}
              {emotion && (
                <div className="text-center text-lg bg-blue-50 border border-blue-200 p-3 rounded-lg">
                  {emotion}
                </div>
              )}
            </div>
          )}

          {/* Before/After hidden share card */}
          {originalForCard && rewrittenForCard && (
            <div
              ref={shareCardRef}
              className="border p-4 rounded-lg bg-gray-50 max-w-xl mx-auto"
              style={{ maxWidth: 600 }}
            >
              <h3 className="text-lg font-semibold mb-3 text-gray-800">
                ToneMender — Before & After
              </h3>
              <div className="mb-3">
                <p className="text-xs font-semibold uppercase text-gray-500">
                  Before
                </p>
                <p className="whitespace-pre-wrap text-sm bg-white border rounded p-2 mt-1">
                  {originalForCard}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-gray-500">
                  After
                </p>
                <p className="whitespace-pre-wrap text-sm bg-white border rounded p-2 mt-1">
                  {rewrittenForCard}
                </p>
              </div>
              <p className="text-[10px] text-gray-400 mt-3">
                Generated with tone13.vercel.app
              </p>
            </div>
          )}

          {/* Visible result card */}
          <div className="border p-4 rounded-lg bg-gray-50">
            <h2 className="text-xl font-semibold capitalize text-blue-700 mb-2">
              {isPro ? displayKey : "soft"} Version
            </h2>

            <p className="whitespace-pre-wrap">{displayText}</p>

            <div className="flex flex-wrap gap-3 mt-4">
              <button
                onClick={() => copyToClipboard(displayText)}
                className="border px-3 py-1 rounded"
              >
                Copy
              </button>

              <button
                onClick={() => useThis(displayText)}
                className="border px-3 py-1 rounded"
              >
                Use This
              </button>

              <button
                onClick={() =>
                  saveMessage(
                    displayText,
                    (isPro ? displayKey : "soft") as any
                  )
                }
                className="border px-3 py-1 rounded bg-green-600 text-white"
              >
                Save
              </button>

              <button onClick={shareRewrite} className="border px-3 py-1 rounded">
                Share Text
              </button>

              <button
                onClick={shareBeforeAfterImage}
                className="border px-3 py-1 rounded"
              >
                Share Before/After Card
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast text={toast} />}
    </main>
  );
}