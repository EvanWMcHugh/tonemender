"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

import { isProReviewer } from "@/lib/auth/reviewers";

const Turnstile = dynamic(() => import("react-turnstile"), { ssr: false });

type UsageStats = {
  today: number;
  total: number;
};

type MeUser = {
  id: string;
  email: string;
  isPro?: boolean;
  planType?: string | null;
};

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

  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

  const [showEmailCaptcha, setShowEmailCaptcha] = useState(false);
  const [emailCaptchaToken, setEmailCaptchaToken] = useState<string | null>(null);

  const [deleteError, setDeleteError] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showDeleteCaptcha, setShowDeleteCaptcha] = useState(false);
  const [deleteCaptchaToken, setDeleteCaptchaToken] = useState<string | null>(null);

  const todayStr = useMemo(() => getPacificDateString(), []);
  const normalizedCurrentEmail = useMemo(
    () => normalizeEmail(user?.email || ""),
    [user?.email]
  );

  const pendingEmailSubmitRef = useRef(false);
  const pendingDeleteSubmitRef = useRef(false);

  function resetEmailCaptchaState() {
    setEmailCaptchaToken(null);
    setShowEmailCaptcha(false);
    pendingEmailSubmitRef.current = false;
  }

  function resetDeleteCaptchaState() {
    setDeleteCaptchaToken(null);
    setShowDeleteCaptcha(false);
    pendingDeleteSubmitRef.current = false;
  }

  function validateEmailCandidate(candidate: string) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    if (!emailRegex.test(candidate)) {
      return "Please enter a valid email address.";
    }

    if (normalizedCurrentEmail && candidate === normalizedCurrentEmail) {
      return "That is already your current email.";
    }

    return "";
  }

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const meResp = await fetch("/api/user/me", {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
        });

        const meJson = await meResp.json().catch(() => ({ user: null }));
        const meUser: MeUser | null = meJson?.user ?? null;

        if (!meUser?.id) {
          router.replace("/sign-in");
          return;
        }

        setUser(meUser);

        const pro = Boolean(meUser.isPro) || isProReviewer(meUser.email ?? null);
        setIsPro(pro);

        const statsResp = await fetch(
          `/api/usage/stats?day=${encodeURIComponent(todayStr)}`,
          {
            method: "GET",
            signal: controller.signal,
            cache: "no-store",
          }
        );

        const statsJson = await statsResp.json().catch(() => null);

        if (statsResp.ok && statsJson?.stats) {
          setStats(statsJson.stats);
        } else {
          setStats({ today: 0, total: 0 });
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        router.replace("/sign-in");
      } finally {
        setLoading(false);
      }
    }

    load();

    return () => controller.abort();
  }, [router, todayStr]);

  async function handleLogout() {
    try {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        cache: "no-store",
      });
    } catch {}

    router.replace("/sign-in");
  }

  async function submitDeleteAccount(turnstileToken: string) {
    setDeleteLoading(true);
    setDeleteError("");

    try {
      const res = await fetch("/api/user/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          turnstileToken,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setDeleteError(json?.error || "Failed to delete account.");
        resetDeleteCaptchaState();
        return;
      }

      resetDeleteCaptchaState();
      alert("Account deleted.");
      router.replace("/landing");
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete account.");
      resetDeleteCaptchaState();
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleteError("");

    const ok = confirm("Delete your ENTIRE account permanently?");
    if (!ok) return;

    if (!deleteCaptchaToken) {
      setShowDeleteCaptcha(true);
      pendingDeleteSubmitRef.current = true;
      return;
    }

    await submitDeleteAccount(deleteCaptchaToken);
  }

  async function openBillingPortal() {
    const res = await fetch("/api/billing/portal", {
      method: "POST",
      cache: "no-store",
    });

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
        cache: "no-store",
        body: JSON.stringify({
          newEmail: candidate,
          turnstileToken,
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
    } catch (err: unknown) {
      setEmailError(err instanceof Error ? err.message : "Failed to send confirmation email.");
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

    if (!emailCaptchaToken) {
      setShowEmailCaptcha(true);
      pendingEmailSubmitRef.current = true;
      return;
    }

    await submitEmailChange(candidate, emailCaptchaToken);
  }

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

    submitEmailChange(candidate, emailCaptchaToken);
  }, [emailCaptchaToken, emailLoading, newEmail, normalizedCurrentEmail]);

  useEffect(() => {
    if (!deleteCaptchaToken) return;
    if (!pendingDeleteSubmitRef.current) return;
    if (deleteLoading) return;

    submitDeleteAccount(deleteCaptchaToken);
  }, [deleteCaptchaToken, deleteLoading]);

  if (loading) {
    return <p className="p-5">Loading...</p>;
  }

  if (!user?.id) {
    return null;
  }

  const candidateNormalized = normalizeEmail(newEmail);
  const emailValidation = newEmail ? validateEmailCandidate(candidateNormalized) : "";

  const emailSubmitDisabled =
    emailLoading ||
    !newEmail.trim() ||
    Boolean(emailValidation) ||
    (showEmailCaptcha && !emailCaptchaToken);

  const deleteSubmitDisabled =
    deleteLoading || (showDeleteCaptcha && !deleteCaptchaToken);

  return (
    <main className="mx-auto max-w-xl p-6">
      <button
        onClick={() => router.push("/")}
        className="mb-4 text-sm text-slate-600 hover:underline"
      >
        ← Back to Home
      </button>

      <h1 className="mb-6 text-3xl font-bold">Your Account</h1>

      <div className="mb-6 rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-xl font-semibold">Profile</h2>

        <p className="text-sm">
          <strong>Email:</strong> {user.email}
        </p>
        <p className="mt-1 text-sm">
          <strong>Status:</strong> {isPro ? "🚀 Pro Member" : "Free User"}
        </p>

        {isPro && (
          <button
            onClick={openBillingPortal}
            className="mt-3 rounded-xl bg-purple-600 px-4 py-2 text-white transition hover:bg-purple-500"
          >
            Manage Subscription
          </button>
        )}
      </div>

      <div className="mb-6 rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-xl font-semibold">Usage</h2>
        <p className="text-sm">
          <strong>Rewrites Today:</strong> {stats.today}
        </p>
        <p className="mt-1 text-sm">
          <strong>Total Rewrites:</strong> {stats.total}
        </p>
      </div>

      <div className="mb-6 rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Security</h2>

        <form onSubmit={handleChangeEmail} className="mb-4" aria-busy={emailLoading}>
          <p className="mb-2 font-medium">Change Email</p>

          {emailError && <p className="mb-1 text-sm text-red-500">{emailError}</p>}
          {!emailError && emailValidation && (
            <p className="mb-1 text-sm text-red-500">{emailValidation}</p>
          )}

          <div className="flex gap-2">
            <input
              type="email"
              placeholder="New email address"
              className="flex-1 rounded-xl border p-2"
              value={newEmail}
              onChange={(e) => {
                setNewEmail(e.target.value);
                setEmailError("");
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
              className="rounded-xl bg-green-600 px-3 py-2 text-white transition hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {emailLoading ? "Sending…" : showEmailCaptcha ? "Verify…" : "Update"}
            </button>
          </div>

          {showEmailCaptcha && (
            <div className="mt-3">
              <Turnstile
                sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
                theme="light"
                onSuccess={(token) => setEmailCaptchaToken(token)}
                onExpire={() => setEmailCaptchaToken(null)}
                onError={() => setEmailCaptchaToken(null)}
              />

              <p className="mt-2 text-[11px] text-slate-500">
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

          <p className="mt-2 text-[11px] text-slate-500">
            After confirming, you may need to log in again using the new email.
          </p>
        </form>

        <button
          onClick={handleLogout}
          className="rounded-xl bg-gray-800 px-4 py-2 text-white transition hover:bg-gray-700"
        >
          Logout
        </button>
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-xl font-semibold text-red-600">Danger Zone</h2>

        {deleteError && <p className="mb-3 text-sm text-red-500">{deleteError}</p>}

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleDeleteAccount}
            disabled={deleteSubmitDisabled}
            className="rounded-xl bg-red-600 px-4 py-2 text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {deleteLoading ? "Deleting…" : showDeleteCaptcha ? "Verify Deletion…" : "Delete Account"}
          </button>
        </div>

        {showDeleteCaptcha && (
          <div className="mt-4">
            <Turnstile
              sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!}
              theme="light"
              onSuccess={(token) => setDeleteCaptchaToken(token)}
              onExpire={() => setDeleteCaptchaToken(null)}
              onError={() => setDeleteCaptchaToken(null)}
            />

            <p className="mt-2 text-[11px] text-slate-500">
              Complete the captcha to continue account deletion. We’ll submit automatically when it’s done.
            </p>

            <button
              type="button"
              onClick={resetDeleteCaptchaState}
              className="mt-2 text-xs text-slate-600 hover:underline"
              disabled={deleteLoading}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </main>
  );
}