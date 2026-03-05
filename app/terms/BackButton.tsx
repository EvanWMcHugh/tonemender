"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

type BackButtonProps = {
  fallbackHref?: string;
};

export default function BackButton({ fallbackHref = "/landing" }: BackButtonProps) {
  const router = useRouter();

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.replace(fallbackHref);
    }
  }, [router, fallbackHref]);

  return (
    <button
      type="button"
      onClick={handleBack}
      className="inline-flex items-center gap-1 mb-6
                 text-sm text-gray-600 hover:text-gray-800 hover:underline
                 transition"
      aria-label="Go back"
    >
      <span aria-hidden="true">←</span>
      <span>Back</span>
    </button>
  );
}