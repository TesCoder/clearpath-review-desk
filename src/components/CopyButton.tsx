"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [refused, setRefused] = useState(false);
  return (
    <>
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setRefused(false);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // The browser can refuse clipboard access. Say so, and say what to do.
          setCopied(false);
          setRefused(true);
        }
      }}
      className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-50"
    >
      {copied ? "Copied" : "Copy approved text"}
    </button>
    {refused ? (
      <p className="mt-2 text-sm text-amber-900" role="status">
        The browser did not allow copying. Select the approved text above and copy it by hand.
      </p>
    ) : null}
    </>
  );
}
