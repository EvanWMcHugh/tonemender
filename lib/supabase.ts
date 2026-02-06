"use client";

import { createClient } from "@supabase/supabase-js";

/**
 * Custom cookie storage to persist session in the browser.
 * NOTE: Cookies are not HttpOnly here, so XSS risk is similar to localStorage.
 * If you later move to SSR auth helpers, revisit this storage strategy.
 */
const createBrowserStorage = () => {
  if (typeof document === "undefined") return undefined;

  const isSecure =
    typeof window !== "undefined" && window.location.protocol === "https:";

  const baseAttrs = `Path=/; SameSite=Lax${isSecure ? "; Secure" : ""}`;

  return {
    getItem: (key: string) => {
      const item = document.cookie
        .split("; ")
        .find((row) => row.startsWith(`${key}=`));
      return item ? decodeURIComponent(item.split("=")[1]) : null;
    },
    setItem: (key: string, value: string) => {
      // Keep cookie for 1 year (adjust if you want shorter)
      document.cookie = `${key}=${encodeURIComponent(
        value
      )}; ${baseAttrs}; Max-Age=31536000`;
    },
    removeItem: (key: string) => {
      // Must match attributes used in setItem
      document.cookie = `${key}=; ${baseAttrs}; Max-Age=0`;
    },
  };
};

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  // Keep your env var name to avoid breaking your app; commonly this is NEXT_PUBLIC_SUPABASE_ANON_KEY
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  {
    auth: {
      persistSession: true,
      storage: createBrowserStorage(),
      autoRefreshToken: true,
      detectSessionInUrl: true, // helps with OAuth/magic-link style flows; safe to keep on
    },
  }
);