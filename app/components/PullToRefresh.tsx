"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";

type PullToRefreshProps = {
  onRefresh: () => void | Promise<void>;
  children: ReactNode;
};

export default function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const startYRef = useRef<number | null>(null);
  const pullingRef = useRef(false);

  function maybeVibrate(ms = 30) {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(ms);
    }
  }

  function canStartPull() {
    if (refreshing) return false;

    // Only allow pull-to-refresh when at the top.
    // window.scrollY can be flaky on mobile; fall back to document scroll.
    const scrollTop =
      typeof window !== "undefined"
        ? window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0
        : 0;

    return scrollTop <= 0;
  }

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (!canStartPull()) return;

    const touch = e.touches?.[0];
    if (!touch) return;

    startYRef.current = touch.clientY;
    pullingRef.current = true;
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (!pullingRef.current || startYRef.current === null) return;

    const touch = e.touches?.[0];
    if (!touch) return;

    const delta = touch.clientY - startYRef.current;

    // If user scrolls up or returns to neutral, reset.
    if (delta <= 0) {
      setPullDistance(0);
      return;
    }

    // Resist + cap
    const limited = Math.min(delta * 0.9, 110);
    setPullDistance(limited);

    // Prevent the browser bounce-scroll while we’re actively pulling
    if (limited > 5) e.preventDefault();
  }

  async function runRefresh() {
    try {
      await onRefresh();
    } catch (err) {
      // Don’t crash the UI if refresh throws
      console.error("PullToRefresh onRefresh error:", err);
    }
  }

  function handleTouchEnd() {
    if (!pullingRef.current) return;

    const threshold = 70;

    if (pullDistance >= threshold && !refreshing) {
      setRefreshing(true);
      maybeVibrate(40);

      // Fire refresh (supports async)
      void runRefresh();

      // Keep indicator briefly so it feels responsive even if refresh is instant
      setTimeout(() => {
        setRefreshing(false);
        setPullDistance(0);
      }, 600);
    } else {
      setPullDistance(0);
    }

    pullingRef.current = false;
    startYRef.current = null;
  }

  const indicatorStyle: React.CSSProperties = {
    transform: `translateY(${pullDistance / 2}px)`,
    opacity: pullDistance > 5 || refreshing ? 1 : 0,
    transition: "opacity 0.15s ease-out",
  };

  const contentStyle: React.CSSProperties = {
    transform: `translateY(${pullDistance}px)`,
    transition: refreshing ? "transform 0.2s ease-out" : "none",
  };

  return (
    <div
      className="relative w-full"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top pull indicator */}
      <div
        className="absolute left-1/2 -translate-x-1/2 top-0 flex items-center gap-2 text-[11px] text-slate-500"
        style={indicatorStyle}
      >
        <div className="h-3 w-3 rounded-full border border-slate-400 border-t-transparent animate-spin" />
        <span>{refreshing ? "Refreshing…" : "Pull to refresh"}</span>
      </div>

      {/* Content that moves down while pulling */}
      <div style={contentStyle}>{children}</div>
    </div>
  );
}