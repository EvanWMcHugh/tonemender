"use client";

import { ReactNode, useRef } from "react";
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";

export default function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const touchStartX = useRef(0);
  const tracking = useRef(false);

  function vibrate(ms = 20) {
    if ("vibrate" in navigator) navigator.vibrate(ms);
  }

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    const t = e.touches[0];
    if (t.clientX < 30) {
      touchStartX.current = t.clientX;
      tracking.current = true;
    }
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (!tracking.current) return;
    const t = e.touches[0];
    if (t.clientX - touchStartX.current > 80) {
      vibrate(15);
      window.history.back();
      tracking.current = false;
    }
  }

  function handleTouchEnd() {
    tracking.current = false;
  }

  return (
    <div
      className="min-h-screen px-4 py-6 bg-slate-100 overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 20, scale: 0.98, filter: "blur(5px)" }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="max-w-xl mx-auto"
      >
        {children}
      </motion.div>
    </div>
  );
}