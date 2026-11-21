"use client";

import { useState } from "react";
import { FINDING_LABEL } from "@/lib/ai/types";
import type { WordingResult } from "@/lib/ai/wording";
import { Badge } from "./ad/ui";
import { CopyView } from "./CopyView";

type Answer = WordingResult & { checked?: string; recorded?: boolean };

/**
 * The marketer's optional AI wording check on a draft. It runs when the button
 * is pressed, never as they type. It is advice only: the submit button beside
 * it does not depend on it in any way.
 */
export function WordingCheck({
  body,
  offerId,
  plannedDate,
  placement,
  ready,
}: {
  body: string;
  offerId: string;
  plannedDate: string;
  placement: string;
  /** False when there are no offer terms to compare the draft with. */
  ready: boolean;
}) {
  const [running, setRunning] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  /** The text and setting the answer is about. A later edit makes the answer stale. */
  const [checkedKey, setCheckedKey] = useState<string | null>(null);
  const key = [body, offerId, plannedDate, placement].join("\u0000");
  const stale = answer !== null && checkedKey !== key;

  const run = async () => {
    setRunning(true);
    const sentKey = key;
    try {
      const response = await fetch("/api/wording-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body, offerId, plannedDate, placement }),
      });
      setAnswer((await response.json()) as Answer);
    } catch {
      setAnswer({ state: "unavailable", notes: [], reason: "The AI wording check could not be reached.", addressesReviewer: false });
    }
    setCheckedKey(sentKey);
    setRunning(false);
  };

  const n = answer?.notes.length ?? 0;
  return (
    <div className="rounded-md border border-violet-200 bg-violet-50/50 p-3" data-panel="wording-check">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">Check the wording with AI (optional)</p>
        <button
          type="button"
          onClick={run}
          disabled={running || !ready || !body.trim()}
          className="rounded-md border border-violet-400 bg-white px-3 py-1.5 text-sm font-medium text-violet-950 hover:bg-violet-100 disabled:opacity-60"
        >
          {running ? "Reading the draft..." : answer && !stale ? "Check again" : "Check wording"}
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-600">
        The AI reads the draft for wording a number check cannot catch, such as promises about approval, speed or savings.
        It is advice only. It cannot approve or block an ad: you can submit either way, and the compliance reviewer
        decides.
      </p>

      <div aria-live="polite" data-result="wording-check" data-state={stale ? "stale" : (answer?.state ?? "none")}>
        {stale ? (
          <p className="mt-2 text-sm text-slate-600">
            The draft changed since the last check. Press Check wording to read the current text.
          </p>
        ) : answer ? (
          <div className="mt-3 space-y-3">
            {answer.state === "unavailable" ? (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950">
                {answer.reason ?? "The AI wording check is unavailable."} You can still submit: the rate and fee check
                above does not depend on the AI, and the reviewer reads the ad.
              </p>
            ) : null}
            {answer.state === "incomplete" ? (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950">
                <span className="font-semibold">AI check incomplete.</span> {answer.reason} Do not read this as a full
                account of the draft.{answer.recorded === false ? "" : " The reviewer sees the same result."}
              </p>
            ) : null}
            {answer.recorded === false ? (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950" data-note="not-recorded">
                This check was not added to the record
                {answer.state === "incomplete" ? ": the AI gave no answer that could be kept" : ": this demo has reached its limit of recorded wording checks"}.
                The reviewer will not be told that it ran, and the AI reads the ad again for them.
              </p>
            ) : null}
            {answer.state === "nothing" ? (
              <p className="text-sm text-slate-700">
                The AI pointed at nothing in the wording of this draft. That is not a sign-off: an AI can miss a claim,
                and the reviewer still reads the ad.
              </p>
            ) : null}
            {n > 0 && answer.checked ? (
              <>
                <p className="text-sm font-medium text-slate-900">
                  The AI pointed at {n === 1 ? "one thing" : `${n} things`} the reviewer is likely to ask about:
                </p>
                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <CopyView
                    body={answer.checked}
                    checks={[]}
                    extra={answer.notes.map((f) => ({ start: f.start, end: f.end, tone: "ai" as const, title: `Found by AI: ${f.why}` }))}
                  />
                </div>
                <ul className="space-y-2">
                  {answer.notes.map((f, i) => (
                    <li key={i} className="rounded-md border border-violet-200 bg-white p-2 text-sm">
                      <p className="text-slate-900">
                        <q className="font-medium">{f.quote}</q>{" "}
                        <Badge label={FINDING_LABEL[f.kind] ?? "Other"} cls="bg-violet-100 text-violet-900" />
                      </p>
                      <p className="mt-0.5 text-slate-600">{f.why}</p>
                      {f.suggestion ? <p className="mt-0.5 text-slate-800">Suggested change: {f.suggestion}</p> : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {answer.addressesReviewer ? (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950">
                The AI reported that this draft contains text addressed to the reviewer or to an AI. The reviewer sees
                that flag too.
              </p>
            ) : null}
            {answer.state !== "unavailable" ? (
              <p className="text-xs text-slate-600">
                {n > 0 ? "Fix the wording above, or submit as it is. " : ""}If you submit this exact text, the reviewer is
                told that you ran this check and what it showed. Every quote here was confirmed to be in your draft, word
                for word.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
