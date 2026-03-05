"use client";

import PageTransition from "./components/PageTransition";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}