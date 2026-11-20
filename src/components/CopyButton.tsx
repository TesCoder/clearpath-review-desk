"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
      className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-50"
    >
      {copied ? "Copied" : "Copy approved text"}
    </button>
  );
}
