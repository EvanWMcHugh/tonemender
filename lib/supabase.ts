"use client";

import { createClient } from "@supabase/supabase-js";

// Custom cookie storage to persist session in browser
const createBrowserStorage = () => {
  if (typeof document === "undefined") return undefined;

  return {
    getItem: (key: string) => {
      const item = document.cookie
        .split("; ")
        .find((row) => row.startsWith(key + "="));
      return item ? decodeURIComponent(item.split("=")[1]) : null;
    },
    setItem: (key: string, value: string) => {
      document.cookie = `${key}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`;
    },
    removeItem: (key: string) => {
      document.cookie = `${key}=; Path=/; Max-Age=0; SameSite=Lax`;
    },
  };
};

// ✅ Use NEW publishable key here
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  {
    auth: {
      persistSession: true,       // persist login
      storage: createBrowserStorage(),
      autoRefreshToken: true,     // refresh token automatically
    },
  }
);