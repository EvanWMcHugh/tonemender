import type { Metadata } from "next";
import ConfirmClient from "./ConfirmClient";

export const metadata: Metadata = {
  title: "Confirm – ToneMender",
  description:
    "Confirm your ToneMender account, email change, or newsletter subscription.",
};

export default function ConfirmPage() {
  return <ConfirmClient />;
}