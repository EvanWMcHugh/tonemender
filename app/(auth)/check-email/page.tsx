import type { Metadata } from "next";
import CheckEmailClient from "./CheckEmailClient";

export const metadata: Metadata = {
  title: "Check Your Email – ToneMender",
  description:
    "Confirm your email, reset your password, or finish updating your ToneMender account email.",
};

export default function CheckEmailPage() {
  return <CheckEmailClient />;
}