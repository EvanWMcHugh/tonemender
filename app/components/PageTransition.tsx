"use client";

import { ReactNode, useMemo, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";

const EDGE_START_PX = 30;
const SWIPE_TRIGGER_PX = 90;
const MAX_VERTICAL_DRIFT_PX = 60; // prevent back gesture during scroll

export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);
  const triggered = useRef(false);

  const transition = useMemo(
    () => ({
      duration: reduceMotion ? 0 : 0.35,
      ease: "easeOut" as const,
    }),
    [reduceMotion]
  );

  function vibrate(ms = 15) {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(ms);
      } catch {}
    }
  }

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    const t = e.touches?.[0];
    if (!t) return;

    triggered.current = false;

    // Only begin swipe-back tracking from left edge
    if (t.clientX <= EDGE_START_PX) {
      startX.current = t.clientX;
      startY.current = t.clientY;
      tracking.current = true;
    } else {
      tracking.current = false;
    }
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (!tracking.current || triggered.current) return;

    const t = e.touches?.[0];
    if (!t) return;

    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;

    // If the user is mainly scrolling vertically, cancel swipe-back tracking
    if (Math.abs(dy) > MAX_VERTICAL_DRIFT_PX && Math.abs(dy) > Math.abs(dx)) {
      tracking.current = false;
      return;
    }

    // Trigger only for a strong right swipe
    if (dx >= SWIPE_TRIGGER_PX && Math.abs(dx) > Math.abs(dy)) {
      triggered.current = true;
      tracking.current = false;
      vibrate(15);

      // Prefer Next router, fallback to history
      try {
        router.back();
      } catch {
        if (typeof window !== "undefined") window.history.back();
      }
    }
  }

  function handleTouchEnd() {
    tracking.current = false;
    triggered.current = false;
  }

  return (
    <div
      className="min-h-screen px-4 py-6 bg-slate-100 overflow-hidden"
      style={{ touchAction: "pan-y" }} // keep scroll smooth; we handle horizontal gesture
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <motion.div
        key={pathname}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.98, filter: "blur(5px)" }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        transition={transition}
        className="max-w-xl mx-auto"
      >
        {children}
      </motion.div>
    </div>
  );
}