"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import html2canvas from "html2canvas";

import Toast from "@/components/Toast";
import PullToRefresh from "@/components/PullToRefresh";

type ToneKey = "soft" | "calm" | "clear";

type MeUser = {
  id: string;
  email: string;
  isPro?: boolean;
  planType?: string | null;
  isReviewer?: boolean;
  reviewerMode?: "free" | "pro" | null;
};

type RewriteResponse = {
  soft?: string;
  calm?: string;
  clear?: string;
  tone_score?: number;
  emotion_prediction?: string;
  rewrites_left?: number | null;
  error?: string;
};

type UsageResponse = {
  rewrites_left?: number | null;
};

function vibrate(ms = 20) {
  if (typeof window !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(ms);
  }
}

export default function RewriteClient({ user }: { user: MeUser }) {
  const router = useRouter();

  const [message, setMessage] = useState("");
  const [recipient, setRecipient] = useState("");
  const [tone, setTone] = useState<ToneKey | "">("");

  const [originalMessageSnapshot, setOriginalMessageSnapshot] = useState("");

  const [results, setResults] = useState<Record<ToneKey, string>>({
    soft: "",
    calm: "",
    clear: "",
  });

  const [toneScore, setToneScore] = useState<number | null>(null);
  const [emotion, setEmotion] = useState("");
  const [rewritesLeft, setRewritesLeft] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [error, setError] = useState("");
  const [limitReached, setLimitReached] = useState(false);
  const [toast, setToast] = useState("");

  const [originalForCard, setOriginalForCard] = useState("");
  const [rewrittenForCard, setRewrittenForCard] = useState("");

  const shareCardRef = useRef<HTMLDivElement | null>(null);
  const rewriteAbortRef = useRef<AbortController | null>(null);

  const isPro = Boolean(user?.isPro);

  const resetUiForNewRewrite = useCallback(() => {
    setError("");
    setLimitReached(false);
    setToneScore(null);
    setEmotion("");
    setToast("");
    setResults({ soft: "", calm: "", clear: "" });
    setOriginalForCard("");
    setRewrittenForCard("");
  }, []);

  const ensureOriginalSnapshot = useCallback(
    (original: string) => {
      if (!originalMessageSnapshot) {
        setOriginalMessageSnapshot(original);
      }
    },
    [originalMessageSnapshot]
  );

  useEffect(() => {
  if (isPro) return;

  let cancelled = false;

  async function loadUsage() {
    try {
      const res = await fetch("/api/usage", {
        method: "GET",
        cache: "no-store",
      });

      let json: UsageResponse = {};
      try {
        json = (await res.json()) as UsageResponse;
      } catch {
        json = {};
      }

      if (!res.ok || cancelled) return;

      if (typeof json.rewrites_left === "number") {
        setRewritesLeft(json.rewrites_left);
        setLimitReached(json.rewrites_left <= 0);
      }
    } catch {}
  }

  void loadUsage();

  return () => {
    cancelled = true;
  };
}, [isPro]);

  const displayKey: ToneKey = useMemo(() => {
    return (isPro ? tone || "soft" : "soft") as ToneKey;
  }, [isPro, tone]);

  const displayText = useMemo(() => {
    return results[displayKey] || results.soft;
  }, [results, displayKey]);

  const rewriteButtonDisabled = useMemo(() => {
    if (loading) return true;
    if (!message.trim()) return true;
    if (isPro && (!recipient || !tone)) return true;
    return false;
  }, [loading, message, isPro, recipient, tone]);

  const showRevertButton = useMemo(() => {
    return Boolean(originalMessageSnapshot) && message !== originalMessageSnapshot;
  }, [originalMessageSnapshot, message]);

  const handleRewrite = useCallback(async () => {
    if (rewriteButtonDisabled) return;

    rewriteAbortRef.current?.abort();
    const controller = new AbortController();
    rewriteAbortRef.current = controller;

    resetUiForNewRewrite();
    setLoading(true);

    const trimmedMessage = message.trim();

    try {
      if (!user?.id) {
        setError("You must be logged in to use ToneMender.");
        router.replace("/sign-in");
        return;
      }

      if (!trimmedMessage) {
        setError("Please paste a message to rewrite.");
        return;
      }

      ensureOriginalSnapshot(trimmedMessage);

      const finalRecipient = isPro ? recipient : "default";
      const finalTone = isPro ? tone || "default" : "default";

      const res = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({
          message: trimmedMessage,
          recipient: finalRecipient,
          tone: finalTone,
        }),
      });

      let json: RewriteResponse = {};
      try {
        json = (await res.json()) as RewriteResponse;
      } catch {
        json = {};
      }

      if (res.status === 429) {
        setLimitReached(true);
        setRewritesLeft(0);
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

      if (!isPro) {
        if (typeof json.rewrites_left === "number") {
          setRewritesLeft(Math.max(json.rewrites_left, 0));
          setLimitReached(json.rewrites_left <= 0);
        } else if (
          typeof json.free_limit === "number" &&
          typeof json.rewrites_today === "number"
        ) {
          const left = Math.max(json.free_limit - json.rewrites_today, 0);
          setRewritesLeft(left);
          setLimitReached(left <= 0);
        }
      }

      const chosenToneKey: ToneKey = isPro
        ? ((finalTone === "default" ? "soft" : finalTone) as ToneKey)
        : "soft";

      const chosenText =
        newResults[chosenToneKey] ||
        newResults.soft ||
        newResults.calm ||
        newResults.clear ||
        "";

      setOriginalForCard(trimmedMessage);
      setRewrittenForCard(chosenText);

      vibrate(15);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }

      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }, [
    rewriteButtonDisabled,
    resetUiForNewRewrite,
    message,
    user,
    router,
    ensureOriginalSnapshot,
    isPro,
    recipient,
    tone,
  ]);

  const copyToClipboard = useCallback(async (text: string) => {
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
  }, []);

  const applyRewrite = useCallback(
    (text: string) => {
      if (!text) return;

      if (!originalMessageSnapshot) {
        setOriginalMessageSnapshot(message.trim());
      }

      setMessage(text);
      window.scrollTo({ top: 0, behavior: "smooth" });
      vibrate(10);
    },
    [originalMessageSnapshot, message]
  );

  const revertToOriginal = useCallback(() => {
    if (!originalMessageSnapshot) return;

    setMessage(originalMessageSnapshot);
    vibrate(15);
  }, [originalMessageSnapshot]);

  const saveMessage = useCallback(
    async (text: string, toneKey: ToneKey) => {
      if (!text) {
        setToast("Nothing to save yet.");
        return;
      }

      try {
        const resp = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            original: originalMessageSnapshot || message,
            tone: toneKey,
            soft_rewrite: toneKey === "soft" ? text : null,
            calm_rewrite: toneKey === "calm" ? text : null,
            clear_rewrite: toneKey === "clear" ? text : null,
          }),
        });

        const json = await resp.json().catch(() => ({}));

        if (!resp.ok) {
          setToast(json?.error || "Failed to save.");
          return;
        }

        setToast("Saved!");
        vibrate(15);
      } catch {
        setToast("Failed to save.");
      }
    },
    [originalMessageSnapshot, message]
  );

  const shareApp = useCallback(async () => {
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
      setToast("Could not share right now.");
    }
  }, []);

  const shareRewrite = useCallback(async () => {
    const key: ToneKey = (isPro ? tone || "soft" : "soft") as ToneKey;
    const current = results[key] || results.soft;

    if (!current) {
      setToast("Rewrite a message first.");
      return;
    }

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
      setToast("Could not share right now.");
    }
  }, [isPro, tone, results, originalMessageSnapshot, message]);

  const shareBeforeAfterImage = useCallback(async () => {
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
      const response = await fetch(dataUrl);
      const blob = await response.blob();
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
    } catch {
      setToast("Could not create share image. Try again.");
    }
  }, [originalForCard, rewrittenForCard]);

  const reviewerLabel =
    user?.reviewerMode === "pro"
      ? "Reviewer Mode · Pro"
      : user?.reviewerMode === "free"
      ? "Reviewer Mode · Free"
      : null;

  return (
    <main className="w-full max-w-2xl">
      <PullToRefresh onRefresh={() => window.location.reload()}>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-lg sm:p-8">
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
              type="button"
            >
              <span aria-hidden>←</span>
              <span>Back</span>
            </button>

            <button
              onClick={shareApp}
              type="button"
              className="rounded-full border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 sm:text-sm"
            >
              Share ToneMender
            </button>
          </div>

          <h1 className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl">
            Rewrite your message
          </h1>
          <p className="mb-4 text-sm text-slate-600">
            Paste the message you&apos;re worried about sending. ToneMender keeps
            your meaning but removes the heat so you don&apos;t start a fight by
            accident.
          </p>

          {reviewerLabel && (
            <div className="mb-4">
              <div className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                {reviewerLabel}
              </div>
            </div>
          )}

          {!isPro && rewritesLeft !== null && !limitReached && (
            <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <p className="mb-1 font-semibold text-slate-800">
                {rewritesLeft > 1 && `${rewritesLeft} free rewrites left today`}
                {rewritesLeft === 1 && "⚠️ 1 free rewrite left today"}
                {rewritesLeft === 0 && "No free rewrites left today"}
              </p>
              <p className="mb-2 text-xs text-slate-600">
                Upgrade to ToneMender Pro for unlimited rewrites, tone control,
                and relationship types.
              </p>
              <a
                href="/upgrade"
                className="inline-flex items-center justify-center rounded-full bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
              >
                Upgrade to Pro
              </a>
            </div>
          )}

          {limitReached && (
            <div className="mb-4 rounded-2xl border border-yellow-200 bg-yellow-50 p-4">
              <p className="mb-1 font-semibold text-slate-800">
                You’ve used all 3 free rewrites for today.
              </p>
              <p className="mb-2 text-xs text-slate-600">
                Upgrade to ToneMender Pro to unlock tone control, relationship
                types, and unlimited rewrites.
              </p>
              <a
                href="/upgrade"
                className="inline-flex items-center justify-center rounded-full bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500"
              >
                Upgrade to Pro
              </a>
            </div>
          )}

          {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Your message
            </label>

            <textarea
              className="min-h-[130px] w-full rounded-2xl border border-slate-300 bg-slate-50 p-3 text-sm transition-colors focus:border-blue-500 focus:bg-white"
              placeholder='Example: "I’m so tired of you ignoring my texts."'
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={loading}
            />

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
                    disabled={loading}
                  >
                    Revert back to original
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Who is this for?
              </label>
              <select
                className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm disabled:bg-slate-100"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                disabled={!isPro || loading}
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
              <label className="mb-1 block text-sm font-medium text-slate-700">
                How do you want to sound?
              </label>
              <select
                className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm disabled:bg-slate-100"
                value={tone}
                onChange={(e) => setTone(e.target.value as ToneKey)}
                disabled={!isPro || loading}
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

          <button
            onClick={handleRewrite}
            disabled={rewriteButtonDisabled}
            className="mt-1 w-full rounded-2xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-400"
            type="button"
          >
            {loading ? "Rewriting…" : "Rewrite my message"}
          </button>

          {displayText && (
            <div className="mt-8 space-y-6">
              {(toneScore !== null || emotion) && (
                <div className="space-y-4">
                  {toneScore !== null && (
                    <div className="flex flex-col items-center">
                      <div
                        className="flex h-24 w-24 items-center justify-center rounded-full text-2xl font-bold shadow-sm"
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
                    <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-center text-sm text-blue-900">
                      {emotion}
                    </div>
                  )}
                </div>
              )}

              {originalForCard && rewrittenForCard && (
                <div
                  ref={shareCardRef}
                  className="fade-scale-in mx-auto max-w-xl rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  style={{ maxWidth: 600 }}
                >
                  <h3 className="mb-3 text-lg font-semibold text-gray-800">
                    ToneMender — Before & After
                  </h3>

                  <div className="mb-3">
                    <p className="text-xs font-semibold uppercase text-gray-500">
                      Before
                    </p>
                    <p className="mt-1 whitespace-pre-wrap rounded-lg border bg-white p-2 text-sm">
                      {originalForCard}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">
                      After
                    </p>
                    <p className="mt-1 whitespace-pre-wrap rounded-lg border bg-white p-2 text-sm">
                      {rewrittenForCard}
                    </p>
                  </div>

                  <p className="mt-3 text-[10px] text-gray-400">
                    Generated with tonemender.com
                  </p>
                </div>
              )}

              <div className="fade-scale-in rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h2 className="mb-2 text-base font-semibold text-blue-800">
                  {displayKey.toUpperCase()} rewrite
                </h2>

                <p className="whitespace-pre-wrap text-sm text-slate-800">
                  {displayText}
                </p>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(displayText)}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 hover:bg-slate-50"
                  >
                    Copy
                  </button>

                  <button
                    type="button"
                    onClick={() => applyRewrite(displayText)}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 hover:bg-slate-50"
                  >
                    Use This
                  </button>

                  <button
                    type="button"
                    onClick={() => saveMessage(displayText, displayKey)}
                    className="rounded-full border border-emerald-500 bg-emerald-500 px-3 py-1.5 text-xs text-white hover:bg-emerald-400"
                  >
                    Save
                  </button>

                  <button
                    type="button"
                    onClick={shareRewrite}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 hover:bg-slate-50"
                  >
                    Share Text
                  </button>

                  <button
                    type="button"
                    onClick={shareBeforeAfterImage}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 hover:bg-slate-50"
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