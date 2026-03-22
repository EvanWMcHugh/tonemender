"use client";

import type { ReactNode, CSSProperties } from "react";
import { useCallback, useRef, useState } from "react";

type PullToRefreshProps = {
  onRefresh: () => void | Promise<void>;
  children: ReactNode;
};

const MAX_PULL = 120;
const TRIGGER_PULL = 75;
const MIN_SPINNER_MS = 500;

export default function PullToRefresh({
  onRefresh,
  children,
}: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const startYRef = useRef<number | null>(null);
  const pullingRef = useRef(false);
  const movedRef = useRef(false);
  const livePullDistanceRef = useRef(0);

  function maybeVibrate(ms = 30) {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(ms);
      } catch {
        // ignore vibration errors
      }
    }
  }

  function getScrollTop(): number {
    if (typeof window === "undefined") return 0;

    return (
      window.scrollY ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0
    );
  }

  function canStartPull() {
    if (refreshing) return false;
    return getScrollTop() <= 0;
  }

  const resetPull = useCallback(() => {
    livePullDistanceRef.current = 0;
    setPullDistance(0);
  }, []);

  const runRefresh = useCallback(async () => {
    const started = Date.now();

    try {
      await onRefresh();
    } catch (error) {
      console.error("PullToRefresh onRefresh error:", error);
    } finally {
      const elapsed = Date.now() - started;
      const remaining = Math.max(0, MIN_SPINNER_MS - elapsed);

      window.setTimeout(() => {
        setRefreshing(false);
        resetPull();
      }, remaining);
    }
  }, [onRefresh, resetPull]);

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (!canStartPull()) return;

    const touch = e.touches?.[0];
    if (!touch) return;

    startYRef.current = touch.clientY;
    pullingRef.current = true;
    movedRef.current = false;
    livePullDistanceRef.current = 0;
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (!pullingRef.current || startYRef.current === null) return;

    const touch = e.touches?.[0];
    if (!touch) return;

    const delta = touch.clientY - startYRef.current;

    if (delta <= 0) {
      resetPull();
      return;
    }

    movedRef.current = true;

    const eased = Math.min(MAX_PULL, delta * 0.85);
    livePullDistanceRef.current = eased;
    setPullDistance(eased);

    if (eased > 6) {
      e.preventDefault();
    }
  }

  function finishGesture() {
    if (!pullingRef.current) return;

    pullingRef.current = false;
    startYRef.current = null;

    if (!movedRef.current) {
      resetPull();
      return;
    }

    if (livePullDistanceRef.current >= TRIGGER_PULL && !refreshing) {
      setRefreshing(true);
      maybeVibrate(40);
      void runRefresh();
    } else {
      resetPull();
    }
  }

  const indicatorStyle: CSSProperties = {
    transform: `translate(-50%, ${pullDistance / 2}px)`,
    opacity: pullDistance > 6 || refreshing ? 1 : 0,
    transition: "opacity 0.15s ease-out",
  };

  const contentStyle: CSSProperties = {
    transform: `translateY(${pullDistance}px)`,
    transition:
      refreshing || pullDistance === 0 ? "transform 0.22s ease-out" : "none",
    willChange: pullDistance > 0 ? "transform" : undefined,
  };

  return (
    <div
      className="relative w-full"
      style={{ touchAction: "pan-x pan-y" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={finishGesture}
      onTouchCancel={finishGesture}
    >
      <div
        className="absolute left-1/2 top-0 flex items-center gap-2 text-[11px] text-slate-500"
        style={indicatorStyle}
        aria-live="polite"
        aria-busy={refreshing}
      >
        <div className="h-3 w-3 animate-spin rounded-full border border-slate-400 border-t-transparent" />
        <span>
          {refreshing
            ? "Refreshing…"
            : pullDistance >= TRIGGER_PULL
            ? "Release to refresh"
            : "Pull to refresh"}
        </span>
      </div>

      <div style={contentStyle}>{children}</div>
    </div>
  );
}