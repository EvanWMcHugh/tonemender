"use client";

import { useRouter } from "next/navigation";

type BackButtonProps = {
  fallbackHref?: string;
};

export default function BackButton({ fallbackHref = "/" }: BackButtonProps) {
  const router = useRouter();

  function handleBack() {
    // If there is no history (direct visit), fall back safely
    if (window.history.length > 1) {
      router.back();
    } else {
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