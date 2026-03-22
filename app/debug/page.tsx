import type { Metadata } from "next";
import { redirect } from "next/navigation";

import DebugClient from "./DebugClient";

export const metadata: Metadata = {
  title: "Debug Session – ToneMender",
  description: "Development-only session debug page.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function DebugPage() {
  if (process.env.NODE_ENV !== "development") {
    redirect("/");
  }

  return <DebugClient />;
}