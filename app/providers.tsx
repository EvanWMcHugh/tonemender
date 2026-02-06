"use client";

import { ReactNode } from "react";
import PageTransition from "./components/PageTransition";

/**
 * Global client-side providers wrapper.
 * Keep this lightweight — avoid adding heavy logic here.
 */
export default function Providers({ children }: { children: ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}