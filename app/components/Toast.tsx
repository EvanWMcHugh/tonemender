"use client";

import { useEffect, useState } from "react";

type ToastProps = {
  text: string;
  duration?: number; // optional override
};

export default function Toast({ text, duration = 1800 }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration]);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50
                 bg-black/90 text-white px-4 py-2 rounded-lg
                 shadow-lg backdrop-blur-sm
                 animate-fade-in"
      role="status"
      aria-live="polite"
    >
      {text}
    </div>
  );
}