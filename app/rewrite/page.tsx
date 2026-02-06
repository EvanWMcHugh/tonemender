"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Toast from "../components/Toast";
import html2canvas from "html2canvas";
import PullToRefresh from "../components/PullToRefresh";
import { isProReviewer } from "../../lib/reviewers";

type ToneKey = "soft" | "calm" | "clear";

export default function RewritePage() {
  const router = useRouter();

  // ---------------------------------------------------------
  // AUTH / PLAN
  // ---------------------------------------------------------
  const [ready, setReady] = useState(false);
  const [isPro, setIsPro] = useState(false);

  // ---------------------------------------------------------
  // INPUTS
  // ---------------------------------------------------------
  const [message, setMessage] = useState("");
  const [recipient, setRecipient] = useState("");
  const [tone, setTone] = useState("");

  // ---------------------------------------------------------
  // ORIGINAL SNAPSHOT + "USE THIS" TRACKING
  // ---------------------------------------------------------
  // Snapshot is captured when the first rewrite happens (so revert works even
  // if user never clicks "Use This"), and is never auto-cleared.
  const [originalMessageSnapshot, setOriginalMessageSnapshot] = useState("");

  // Stores the last rewrite the user clicked "Use This" on (optional future use).
  const [usedRewriteText, setUsedRewriteText] = useState("");

  // Indicates the textarea is currently showing a "used rewrite" (optional, used for share logic).
  const [usedRewrite, setUsedRewrite] = useState(false);

  // ---------------------------------------------------------
  // RESULTS / METADATA
  // ---------------------------------------------------------
  const [results, setResults] = useState<Record<ToneKey, string>>({
    soft: "",
    calm: "",
    clear: "",
  });

  const [toneScore, setToneScore] = useState<number | null>(null);
  const [emotion, setEmotion] = useState("");

  // ---------------------------------------------------------
  // UI STATE
  // ---------------------------------------------------------
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [limitReached, setLimitReached] = useState(false);
  const [toast, setToast] = useState("");

  // ---------------------------------------------------------
  // SHARE CARD (Before/After image)
  // ---------------------------------------------------------
  const [originalForCard, setOriginalForCard] = useState("");
  const [rewrittenForCard, setRewrittenForCard] = useState("");
  const shareCardRef = useRef<HTMLDivElement | null>(null);

  function vibrate(ms = 20) {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(ms);
    }
  }

  function normalizeEmail(email: string | null) {
    return (email ?? "").trim().toLowerCase();
  }

  // ---------------------------------------------------------
  // AUTH CHECK + FETCH PRO STATUS
  // ---------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data } = await supabase.auth.getSession();
        const user = data.session?.user;

        if (!user) {
          router.replace("/sign-in");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("is_pro")
          .eq("id", user.id)
          .single();

        if (cancelled) return;

        const email = normalizeEmail(user.email ?? null);
        setIsPro(Boolean(profile?.is_pro) || isProReviewer(email));
        setReady(true);
      } catch (err) {
        console.error("REWRITE AUTH LOAD ERROR:", err);
        router.replace("/sign-in");
      }
    }

    load();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) router.replace("/sign-in");
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  if (!ready) {
    return <main className="p-8 text-center">Checking authentication…</main>;
  }

  // ---------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------
  function resetUiForNewRewrite() {
    setError("");
    setLimitReached(false);
    setToneScore(null);
    setEmotion("");
    setToast("");
    setResults({ soft: "", calm: "", clear: "" });
  }

  // Capture the original snapshot ONCE (first successful rewrite in a session).
  // We intentionally never auto-clear it—user wants revert available anytime
  // the message differs from that snapshot.
  function ensureOriginalSnapshot(original: string) {
    if (!originalMessageSnapshot) {
      setOriginalMessageSnapshot(original);
    }
  }

  // ---------------------------------------------------------
  // HANDLE REWRITE
  // ---------------------------------------------------------
  async function handleRewrite() {
    resetUiForNewRewrite();
    setLoading(true);

    const trimmedMessage = message.trim();

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const user = data.session?.user;

      if (!token || !user) {
        setError("You must be logged in to use ToneMender.");
        return;
      }

      if (!trimmedMessage) {
        setError("Please paste a message to rewrite.");
        return;
      }

      // ✅ Save original so revert works even if user never clicks "Use This"
      ensureOriginalSnapshot(trimmedMessage);

      const finalRecipient = isPro ? recipient : "default";
      const finalTone = isPro ? tone : "default";

      const res = await fetch("/api/rewrite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: trimmedMessage,
          recipient: finalRecipient,
          tone: finalTone,
        }),
      });

      let json: any = {};
      try {
        json = await res.json();
      } catch {
        json = {};
      }

      if (res.status === 429) {
        setLimitReached(true);
        return;
      }

      if (!res.ok) {
        setError(json?.error || "Something went wrong.");
        return;
      }

      const newResults: Record<ToneKey, string> = {
        soft: String(json.soft ?? "").trim(),
        calm: String(json.calm ?? "").trim(),
        clear: String(json.clear ?? "").trim(),
      };

      setResults(newResults);

      setToneScore(typeof json.tone_score === "number" ? json.tone_score : null);
      setEmotion(String(json.emotion_prediction ?? "").trim());

      const chosenToneKey: ToneKey = isPro
        ? ((finalTone === "default" ? "soft" : finalTone) as ToneKey)
        : "soft";

      const chosenText =
        newResults[chosenToneKey] ||
        newResults.soft ||
        newResults.calm ||
        newResults.clear ||
        "";

      // Share card content
      setOriginalForCard(trimmedMessage);
      setRewrittenForCard(chosenText);

      vibrate(15);
    } catch (err) {
      console.error("REWRITE REQUEST ERROR:", err);
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------------------------
  // COPY, USE, REVERT
  // ---------------------------------------------------------
  async function copyToClipboard(text: string) {
    if (!text) {
      setToast("Nothing to copy yet.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setToast("Copied!");
      vibrate(10);
    } catch {
      setToast("Could not copy. Try again.");
    }
  }

  function useThis(text: string) {
    if (!text) return;

    // If snapshot doesn't exist yet, capture current textarea as original.
    // (Usually already captured on first rewrite, but this is safe.)
    if (!originalMessageSnapshot) {
      setOriginalMessageSnapshot(message.trim());
    }

    setUsedRewriteText(text);
    setMessage(text);
    setUsedRewrite(true);

    window.scrollTo({ top: 0, behavior: "smooth" });
    vibrate(10);
  }

  // ✅ Revert always returns textarea to original snapshot and keeps results visible.
  function revertToOriginal() {
    if (!originalMessageSnapshot) return;

    setMessage(originalMessageSnapshot);
    setUsedRewrite(false);
    vibrate(15);
  }

  // ---------------------------------------------------------
  // SAVE
  // ---------------------------------------------------------
  async function saveMessage(text: string, toneKey: ToneKey) {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;

    if (!user) {
      setToast("You must be logged in to save messages.");
      return;
    }

    const insertData: any = {
      user_id: user.id,
      original: originalMessageSnapshot || message,
      tone: toneKey,
      soft_rewrite: null,
      calm_rewrite: null,
      clear_rewrite: null,
    };

    if (toneKey === "soft") insertData.soft_rewrite = text;
    if (toneKey === "calm") insertData.calm_rewrite = text;
    if (toneKey === "clear") insertData.clear_rewrite = text;

    const { error } = await supabase.from("messages").insert(insertData);

    if (error) {
      console.error("SAVE ERROR:", error);
      setToast("Failed to save.");
    } else {
      setToast("Saved!");
      vibrate(15);
    }
  }

  // ---------------------------------------------------------
  // SHARE
  // ---------------------------------------------------------
  async function shareApp() {
    const url = "https://tonemender.com";

    try {
      if (navigator.share) {
        vibrate(10);
        await navigator.share({
          title: "ToneMender",
          text: "I’m using ToneMender to rewrite texts more safely. Check it out:",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setToast("App link copied!");
        vibrate(10);
      }
    } catch {
      // ignore
    }
  }

  async function shareRewrite() {
    const key: ToneKey = (isPro ? (tone || "soft") : "soft") as ToneKey;
    const current = results[key] || results.soft;

    if (!current) {
      setToast("Rewrite a message first.");
      return;
    }

    // If user used a rewrite and then edited, the "before" we want is still the original snapshot if available.
    const beforeText = (originalMessageSnapshot || message).trim();

    const shareText = `Before:\n${beforeText}\n\nAfter:\n${current}\n\nWritten with ToneMender (https://tonemender.com)`;

    try {
      if (navigator.share) {
        vibrate(10);
        await navigator.share({
          title: "My ToneMender Rewrite",
          text: shareText,
        });
      } else {
        await navigator.clipboard.writeText(shareText);
        setToast("Rewrite copied to clipboard!");
        vibrate(10);
      }
    } catch {
      // ignore
    }
  }

  async function shareBeforeAfterImage() {
    if (!shareCardRef.current || !originalForCard || !rewrittenForCard) {
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
        vibrate(10);
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
        vibrate(10);
      }
    } catch (err) {
      console.error(err);
      setToast("Could not create share image. Try again.");
    }
  }

  // ---------------------------------------------------------
  // UI
  // ---------------------------------------------------------
  const displayKey: ToneKey = (isPro ? (tone || "soft") : "soft") as ToneKey;
  const displayText = results[displayKey] || results.soft;

  const rewriteButtonDisabled =
    loading || !message.trim() || (isPro && (!recipient || !tone));

  // Show the revert button any time the current message differs from the original snapshot.
  const showRevertButton =
    !!originalMessageSnapshot && message !== originalMessageSnapshot;

  return (
    <main className="w-full max-w-2xl">
      <PullToRefresh onRefresh={() => window.location.reload()}>
        <div className="bg-white rounded-3xl shadow-lg border border-slate-200 p-6 sm:p-8">
          {/* Header row */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => router.push("/")}
              className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"
            >
              <span>←</span>
              <span>Back</span>
            </button>

            <button
              onClick={shareApp}
              className="text-xs sm:text-sm border border-slate-300 rounded-full px-3 py-1.5 text-slate-700 hover:bg-slate-50"
            >
              Share ToneMender
            </button>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
            Rewrite your message
          </h1>
          <p className="text-sm text-slate-600 mb-4">
            Paste the message you&apos;re worried about sending. ToneMender keeps
            your meaning but removes the heat so you don&apos;t start a fight by
            accident.
          </p>

          {limitReached && (
            <div className="mb-4 p-4 rounded-2xl bg-yellow-50 border border-yellow-200">
              <p className="font-semibold mb-1 text-slate-800">
                You’ve used all 3 free rewrites for today.
              </p>
              <p className="mb-2 text-xs text-slate-600">
                Upgrade to ToneMender Pro to unlock tone control, relationship
                types, and unlimited rewrites.
              </p>
              <a
                href="/upgrade"
                className="inline-flex items-center justify-center bg-purple-600 text-white px-3 py-1.5 rounded-full text-xs font-medium hover:bg-purple-500"
              >
                Upgrade to Pro
              </a>
            </div>
          )}

          {error && <p className="text-red-500 mb-3 text-sm">{error}</p>}

          {/* Message */}
          <div className="mb-4">
            <label className="block mb-2 text-sm font-medium text-slate-700">
              Your message
            </label>

            <textarea
              className="border border-slate-300 bg-slate-50 focus:bg-white focus:border-blue-500 transition-colors p-3 w-full rounded-2xl min-h-[130px] text-sm"
              placeholder='Example: "I’m so tired of you ignoring my texts."'
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />

            {/* Status + Revert */}
            {originalMessageSnapshot && (
              <div className="mt-2 flex items-center gap-3">
                <span className="text-[11px] text-slate-500">
                  {message === originalMessageSnapshot
                    ? "Viewing original"
                    : "Changed from original"}
                </span>

                {showRevertButton && (
                  <button
                    type="button"
                    onClick={revertToOriginal}
                    className="text-xs text-slate-600 underline hover:text-slate-800"
                  >
                    Revert back to original
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Relationship & Tone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block mb-1 text-sm font-medium text-slate-700">
                Who is this for?
              </label>
              <select
                className="border border-slate-300 rounded-xl p-2.5 w-full text-sm bg-white disabled:bg-slate-100"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                disabled={!isPro}
              >
                <option value="" disabled>
                  {isPro ? "Select relationship" : "Pro Required: Locked"}
                </option>
                <option value="partner">Romantic Partner</option>
                <option value="friend">Friend</option>
                <option value="family">Family</option>
                <option value="coworker">Coworker</option>
              </select>
            </div>

            <div>
              <label className="block mb-1 text-sm font-medium text-slate-700">
                How do you want to sound?
              </label>
              <select
                className="border border-slate-300 rounded-xl p-2.5 w-full text-sm bg-white disabled:bg-slate-100"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                disabled={!isPro}
              >
                <option value="" disabled>
                  {isPro ? "Select tone" : "Pro Required: Locked"}
                </option>
                <option value="soft">Soft & Gentle</option>
                <option value="calm">Calm & Neutral</option>
                <option value="clear">Clear & Direct</option>
              </select>
            </div>
          </div>

          {/* Rewrite button */}
          <button
            onClick={handleRewrite}
            disabled={rewriteButtonDisabled}
            className="w-full rounded-2xl bg-blue-600 text-white py-3 text-sm font-semibold mt-1 disabled:bg-slate-400 disabled:cursor-not-allowed shadow-sm hover:bg-blue-500 transition"
          >
            {loading ? "Rewriting…" : "Rewrite my message"}
          </button>

          {/* Results */}
          {displayText && (
            <div className="mt-8 space-y-6">
              {/* Tone score + emotion block */}
              {(toneScore !== null || emotion) && (
                <div className="space-y-4">
                  {toneScore !== null && (
                    <div className="flex flex-col items-center">
                      <div
                        className="w-24 h-24 rounded-full flex items-center justify-center text-2xl font-bold shadow-sm"
                        style={{
                          background: "#e0f2fe",
                          border: "4px solid #38bdf8",
                          color: "#0369a1",
                        }}
                      >
                        {toneScore}
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Tone Score — higher means calmer, clearer, safer to send.
                      </p>
                    </div>
                  )}

                  {emotion && (
                    <div className="text-center text-sm bg-blue-50 border border-blue-100 text-blue-900 px-4 py-3 rounded-2xl">
                      {emotion}
                    </div>
                  )}
                </div>
              )}

              {/* Hidden Before/After card used for image sharing */}
              {originalForCard && rewrittenForCard && (
                <div
                  ref={shareCardRef}
                  className="border border-slate-200 p-4 rounded-2xl bg-slate-50 max-w-xl mx-auto fade-scale-in"
                  style={{ maxWidth: 600 }}
                >
                  <h3 className="text-lg font-semibold mb-3 text-gray-800">
                    ToneMender — Before & After
                  </h3>
                  <div className="mb-3">
                    <p className="text-xs font-semibold uppercase text-gray-500">
                      Before
                    </p>
                    <p className="whitespace-pre-wrap text-sm bg-white border rounded-lg p-2 mt-1">
                      {originalForCard}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">
                      After
                    </p>
                    <p className="whitespace-pre-wrap text-sm bg-white border rounded-lg p-2 mt-1">
                      {rewrittenForCard}
                    </p>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-3">
                    Generated with tonemender.com
                  </p>
                </div>
              )}

              {/* Visible result card */}
              <div className="border border-slate-200 p-4 rounded-2xl bg-slate-50 fade-scale-in">
                <h2 className="text-base font-semibold text-blue-800 mb-2">
                  {displayKey.toUpperCase()} rewrite
                </h2>

                <p className="whitespace-pre-wrap text-sm text-slate-800">
                  {displayText}
                </p>

                <div className="flex flex-wrap gap-3 mt-4">
                  <button
                    onClick={() => copyToClipboard(displayText)}
                    className="border border-slate-300 px-3 py-1.5 rounded-full text-xs text-slate-800 bg-white hover:bg-slate-50"
                  >
                    Copy
                  </button>

                  <button
                    onClick={() => useThis(displayText)}
                    className="border border-slate-300 px-3 py-1.5 rounded-full text-xs text-slate-800 bg-white hover:bg-slate-50"
                  >
                    Use This
                  </button>

                  <button
                    onClick={() => saveMessage(displayText, displayKey)}
                    className="border border-emerald-500 px-3 py-1.5 rounded-full text-xs text-white bg-emerald-500 hover:bg-emerald-400"
                  >
                    Save
                  </button>

                  <button
                    onClick={shareRewrite}
                    className="border border-slate-300 px-3 py-1.5 rounded-full text-xs text-slate-800 bg-white hover:bg-slate-50"
                  >
                    Share Text
                  </button>

                  <button
                    onClick={shareBeforeAfterImage}
                    className="border border-slate-300 px-3 py-1.5 rounded-full text-xs text-slate-800 bg-white hover:bg-slate-50"
                  >
                    Share Before/After Card
                  </button>
                </div>
              </div>
            </div>
          )}

          {toast && <Toast text={toast} />}
        </div>
      </PullToRefresh>
    </main>
  );
}