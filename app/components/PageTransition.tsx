"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";

const EDGE_START_PX = 30;
const SWIPE_TRIGGER_PX = 90;
const MAX_VERTICAL_DRIFT_PX = 60;

export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const [hasHydrated, setHasHydrated] = useState(false);

  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);
  const triggered = useRef(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

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
    const touch = e.touches?.[0];
    if (!touch) return;

    triggered.current = false;

    if (touch.clientX <= EDGE_START_PX) {
      startX.current = touch.clientX;
      startY.current = touch.clientY;
      tracking.current = true;
      return;
    }

    tracking.current = false;
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (!tracking.current || triggered.current) return;

    const touch = e.touches?.[0];
    if (!touch) return;

    const dx = touch.clientX - startX.current;
    const dy = touch.clientY - startY.current;

    if (Math.abs(dy) > MAX_VERTICAL_DRIFT_PX && Math.abs(dy) > Math.abs(dx)) {
      tracking.current = false;
      return;
    }

    if (dx >= SWIPE_TRIGGER_PX && Math.abs(dx) > Math.abs(dy)) {
      triggered.current = true;
      tracking.current = false;
      vibrate(15);

      try {
        router.back();
      } catch {
        if (typeof window !== "undefined") {
          window.history.back();
        }
      }
    }
  }

  function handleTouchEnd() {
    tracking.current = false;
    triggered.current = false;
  }

  const initialAnimation =
    hasHydrated && !reduceMotion
      ? { opacity: 0, y: 20, scale: 0.98, filter: "blur(5px)" }
      : false;

  const animateState = reduceMotion
    ? { opacity: 1 }
    : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" };

  return (
    <div
      className="min-h-screen overflow-hidden bg-slate-100 px-4 py-6"
      style={{ touchAction: "pan-y" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <motion.div
        key={pathname}
        initial={initialAnimation}
        animate={animateState}
        transition={transition}
        className="mx-auto max-w-xl"
      >
        {children}
      </motion.div>
    </div>
  );
}