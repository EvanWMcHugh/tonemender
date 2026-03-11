"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

type BackButtonProps = {
  fallbackHref?: string;
  label?: string;
  className?: string;
};

export default function BackButton({
  fallbackHref = "/(marketing)/landing",
  label = "Back",
  className = "",
}: BackButtonProps) {
  const router = useRouter();
  const [navigating, setNavigating] = useState(false);

  const handleBack = useCallback(() => {
    if (navigating) return;
    setNavigating(true);

    try {
      if (typeof window !== "undefined" && window.history.length > 1) {
        router.back();
      } else {
        router.replace(fallbackHref);
      }
    } catch (err) {
      console.error("Back navigation failed:", err);
      router.replace(fallbackHref);
    }
  }, [router, fallbackHref, navigating]);

  return (
    <button
      type="button"
      onClick={handleBack}
      disabled={navigating}
      aria-label="Go back"
      className={`inline-flex items-center gap-1 mb-6
                  text-sm text-gray-600 hover:text-gray-800 hover:underline
                  transition disabled:opacity-60 disabled:cursor-not-allowed
                  ${className}`}
    >
      <span aria-hidden>←</span>
      <span>{label}</span>
    </button>
  );
}