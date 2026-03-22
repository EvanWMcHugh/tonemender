"use client";

import { useEffect, useState } from "react";

type ToastProps = {
  text: string;
  duration?: number;
};

const EXIT_ANIMATION_MS = 180;

export default function Toast({ text, duration = 1800 }: ToastProps) {
  const [mounted, setMounted] = useState(true);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    setMounted(true);
    setExiting(false);

    const exitTimer = window.setTimeout(() => {
      setExiting(true);
    }, duration);

    const unmountTimer = window.setTimeout(() => {
      setMounted(false);
    }, duration + EXIT_ANIMATION_MS);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(unmountTimer);
    };
  }, [text, duration]);

  if (!mounted) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={[
        "fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-black/90 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-sm pointer-events-none transition-all duration-200",
        exiting ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100",
      ].join(" ")}
    >
      {text}
    </div>
  );
}