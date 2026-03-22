"use client";

import { useRouter } from "next/navigation";

type BackButtonProps = {
  fallbackHref?: string;
  label?: string;
  className?: string;
};

export default function BackButton({
  fallbackHref = "/landing",
  label = "Back",
  className = "",
}: BackButtonProps) {
  const router = useRouter();

  function handleBack() {
    try {
      if (typeof window !== "undefined" && window.history.length > 1) {
        router.back();
        return;
      }

      router.replace(fallbackHref);
    } catch (error) {
      console.error("Back navigation failed:", error);
      router.replace(fallbackHref);
    }
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label="Go back"
      className={`mb-6 inline-flex items-center gap-1 text-sm text-slate-600 transition hover:text-slate-800 hover:underline ${className}`}
    >
      <span aria-hidden>←</span>
      <span>{label}</span>
    </button>
  );
}