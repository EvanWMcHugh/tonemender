"use client";
import { useEffect, useState } from "react";

export default function Toast({ text }: { text: string }) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    setTimeout(() => setShow(false), 1800);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-black text-white px-4 py-2 rounded shadow-lg z-50">
      {text}
    </div>
  );
}