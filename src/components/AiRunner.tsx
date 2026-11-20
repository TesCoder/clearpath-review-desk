"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { runAiReview } from "@/app/actions";

/**
 * Starts the AI claim finder for a version that has no stored result yet, then
 * reloads the page data. If the model cannot be reached, it says so plainly:
 * an AI that did not run is never shown as an AI that found nothing.
 */
export function AiRunner({ adRef, configured }: { adRef: string; configured: boolean }) {
  const router = useRouter();
  const started = useRef(false);
  const [state, setState] = useState<"running" | "failed" | "idle">(configured ? "running" : "idle");
  const [reason, setReason] = useState<string | null>(null);

  const run = async () => {
    setState("running");
    try {
      const result = await runAiReview(adRef);
      if (result.status === "unavailable") {
        setReason(result.reason);
        setState("failed");
      } else {
        router.refresh();
      }
    } catch {
      setReason("The AI claim finder could not be reached.");
      setState("failed");
    }
  };

  useEffect(() => {
    if (!configured || started.current) return;
    started.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "running") {
    return <p className="text-sm text-slate-600" role="status">The AI is reading the ad for claims the number check does not cover...</p>;
  }
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="status">
      <p className="font-semibold">AI claim finder unavailable</p>
      <p className="mt-1">
        {reason ?? "The AI claim finder is not set up on this deployment."} The code checks above are complete and still
        apply. Read the ad yourself for wording that is not a number.
      </p>
      {configured ? (
        <button type="button" onClick={run} className="mt-2 rounded-md border border-amber-400 bg-white px-2.5 py-1 font-medium hover:bg-amber-100">
          Try again
        </button>
      ) : null}
    </div>
  );
}
