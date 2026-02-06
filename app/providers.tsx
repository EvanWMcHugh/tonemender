"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import PageTransition from "./components/PageTransition";

const PUBLIC_PATHS = new Set([
  "/landing",
  "/sign-in",
  "/sign-up",
  "/check-email",
  "/reset-password",
  "/confirm",
  "/privacy",
  "/terms",
  "/blog",
  "/blog/fix-tone-in-text-messages",
  "/relationship-message-rewriter",
]);

export default function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        // Force sign-in on any sign-out from any page
        if (pathname !== "/sign-in") {
          router.replace("/sign-in");
        }
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [router, pathname]);

  return <PageTransition>{children}</PageTransition>;
}