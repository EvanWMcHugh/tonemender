"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

type PullToRefreshProps = {
  onRefresh: () => void | Promise<void>;
  children: ReactNode;
};

const MAX_PULL = 120;
const TRIGGER_PULL = 75;
const MIN_SPINNER_MS = 500;

export default function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const startYRef = useRef<number | null>(null);
  const pullingRef = useRef(false);
  const movedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  function maybeVibrate(ms = 30) {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(ms);
      } catch {}
    }
  }

  function getScrollTop(): number {
    if (typeof window === "undefined") return 0;
    return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  }

  function canStartPull() {
    if (refreshing) return false;
    return getScrollTop() <= 0;
  }

  async function runRefresh() {
    const started = Date.now();

    try {
      await onRefresh();
    } catch (err) {
      console.error("PullToRefresh onRefresh error:", err);
    } finally {
      const elapsed = Date.now() - started;
      const remaining = Math.max(0, MIN_SPINNER_MS - elapsed);

      // Keep the spinner visible at least a bit (feels responsive)
      window.setTimeout(() => {
        setRefreshing(false);
        setPullDistance(0);
      }, remaining);
    }
  }

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (!canStartPull()) return;

    const t = e.touches?.[0];
    if (!t) return;

    startYRef.current = t.clientY;
    pullingRef.current = true;
    movedRef.current = false;
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (!pullingRef.current || startYRef.current === null) return;

    const t = e.touches?.[0];
    if (!t) return;

    const delta = t.clientY - startYRef.current;

    // If user scrolls up or returns to neutral, reset.
    if (delta <= 0) {
      setPullDistance(0);
      return;
    }

    movedRef.current = true;

    // Resist + cap (easing)
    const eased = Math.min(MAX_PULL, delta * 0.85);
    setPullDistance(eased);

    // Prevent browser bounce/scroll while pulling (only if we’re actually pulling down)
    if (eased > 6) e.preventDefault();
  }

  function finishGesture() {
    if (!pullingRef.current) return;

    pullingRef.current = false;
    startYRef.current = null;

    if (!movedRef.current) {
      setPullDistance(0);
      return;
    }

    if (pullDistance >= TRIGGER_PULL && !refreshing) {
      setRefreshing(true);
      maybeVibrate(40);
      void runRefresh();
    } else {
      setPullDistance(0);
    }
  }

  // iOS/Android sometimes cancel touches (incoming call, app switch, etc.)
  function handleTouchEnd() {
    finishGesture();
  }
  function handleTouchCancel() {
    finishGesture();
  }

  // Slightly better default mobile behavior:
  // allow vertical scrolling normally, but we’ll prevent it during active pull
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Ensure browser knows we intend to handle gestures nicely
    el.style.touchAction = "pan-x pan-y";

    return () => {};
  }, []);

  const indicatorStyle: React.CSSProperties = {
    transform: `translate(-50%, ${pullDistance / 2}px)`,
    opacity: pullDistance > 6 || refreshing ? 1 : 0,
    transition: "opacity 0.15s ease-out",
  };

  const contentStyle: React.CSSProperties = {
    transform: `translateY(${pullDistance}px)`,
    transition:
      refreshing || pullDistance === 0 ? "transform 0.22s ease-out" : "none",
    willChange: pullDistance > 0 ? "transform" : undefined,
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      {/* Top pull indicator */}
      <div
        className="absolute left-1/2 top-0 flex items-center gap-2 text-[11px] text-slate-500"
        style={indicatorStyle}
        aria-live="polite"
        aria-busy={refreshing}
      >
        <div className="h-3 w-3 rounded-full border border-slate-400 border-t-transparent animate-spin" />
        <span>{refreshing ? "Refreshing…" : pullDistance >= TRIGGER_PULL ? "Release to refresh" : "Pull to refresh"}</span>
      </div>

      {/* Content that moves down while pulling */}
      <div style={contentStyle}>{children}</div>
    </div>
  );
}