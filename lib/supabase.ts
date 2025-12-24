"use client";

import { createClient } from "@supabase/supabase-js";

// Cookie-safe storage (client only)
const createBrowserStorage = () => {
  if (typeof document === "undefined") {
    return undefined; // Server cannot access document/cookies
  }

  return {
    getItem: (key: string) => {
      const item = document.cookie
        .split("; ")
        .find((row) => row.startsWith(key + "="));
      return item ? item.split("=")[1] : null;
    },
    setItem: (key: string, value: string) => {
      document.cookie = `${key}=${value}; Path=/; SameSite=Lax`;
    },
    removeItem: (key: string) => {
      document.cookie = `${key}=; Path=/; Max-Age=0; Path=/; SameSite=Lax`;
    },
  };
};

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  {
    auth: {
      persistSession: true,
      storage: createBrowserStorage(), // safe for SSR
      autoRefreshToken: true,
    },
  }
);