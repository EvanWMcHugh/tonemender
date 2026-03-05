"use client";

import { useEffect, useState } from "react";

type ToastProps = {
  text: string;
  duration?: number;
};

export default function Toast({ text, duration = 1800 }: ToastProps) {
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    setVisible(true);
    setExiting(false);

    const hideTimer = setTimeout(() => {
      setExiting(true);
    }, duration);

    const removeTimer = setTimeout(() => {
      setVisible(false);
    }, duration + 180); // allow exit animation

    return () => {
      clearTimeout(hideTimer);
      clearTimeout(removeTimer);
    };
  }, [text, duration]);

  if (!visible) return null;

  return (
    <div
      className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50
        px-4 py-2 rounded-lg
        bg-black/90 text-white shadow-lg backdrop-blur-sm
        text-sm font-medium
        pointer-events-none
        transition-all duration-200
        ${exiting ? "opacity-0 translate-y-1" : "opacity-100 translate-y-0"}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {text}
    </div>
  );
}