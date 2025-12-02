import { redirect } from "next/navigation";

export default function Home() {
  // Immediately redirect visitors to the landing page
  redirect("/landing");

  // Returning null satisfies TypeScript
  return null;
}