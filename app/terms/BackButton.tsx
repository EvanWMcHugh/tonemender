"use client";

import { useRouter } from "next/navigation";

type BackButtonProps = {
  fallbackHref?: string;
};

export default function BackButton({ fallbackHref = "/landing" }: BackButtonProps) {
  const router = useRouter();

  function handleBack() {
    // If user has navigation history, go back
    if (window.history.length > 1) {
      router.back();
    } else {
      // Fallback for direct visits
      router.replace(fallbackHref);
    }
  }

  return (
    <button
      onClick={handleBack}
      className="inline-flex items-center gap-1 mb-6
                 text-sm text-gray-600 hover:text-gray-800 hover:underline
                 transition"
      aria-label="Go back"
    >
      <span aria-hidden>←</span>
      <span>Back</span>
    </button>
  );
}