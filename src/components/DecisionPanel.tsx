"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { decide, type FormState } from "@/app/actions";
import { MAX_ANCHOR_CHARS } from "@/lib/checks";
import { FormError, TEXT_BOX } from "./form";

export type Anchor = {
  quote: string;
  /** A comment the reviewer can edit, drafted by the code check or by the AI (see `source`). */
  draft: string;
  flagged: boolean;
  /** Who wrote the draft: the offer check in code, or the AI. */
  source: "check" | "ai";
};

type Props = {
  adRef: string;
  versionNumber: number;
  fingerprint: string;
  /** What the decision covers, as shown on this page. The server refuses if any of it has moved. */
  plannedDate: string;
  placement: string;
  offerRevisionId: string;
  anchors: Anchor[];
  /** How many AI findings are on the page beyond the code checks. */
  aiFindings: number;
  mismatches: number;
  /** One sentence saying exactly what an approval covers. */
  covers: string;
  copyElementId: string;
  maxComment: number;
};

const initial: FormState = { error: null };

export function DecisionPanel(props: Props) {
  const { anchors, mismatches } = props;
  const firstFlag = anchors.find((a) => a.flagged) ?? null;
  const [state, action, pending] = useActionState(decide, initial);
  // With an open code flag, the likely next step is a request, so start there.
  // Otherwise nothing is preselected: the reviewer picks. Approve is never the
  // starting choice, so the screen cannot lean toward it while the AI's read
  // is still arriving, and a choice the reviewer made stays as they made it.
  const [mode, setMode] = useState<"approve" | "request_changes" | null>(firstFlag ? "request_changes" : null);
  const [anchor, setAnchor] = useState(firstFlag?.quote ?? "");
  const [comment, setComment] = useState(firstFlag?.draft ?? "");
  const [edited, setEdited] = useState(false);
  // The same fact as `edited`, readable from the selection listener below. That
  // listener is attached once, so it would otherwise see a stale `edited`.
  const editedRef = useRef(false);

  // Selecting words in the ad anchors the request to them.
  useEffect(() => {
    const onSelect = () => {
      const sel = window.getSelection();
      const el = document.getElementById(props.copyElementId);
      if (!sel || sel.isCollapsed || !el || !sel.anchorNode || !sel.focusNode) return;
      if (!el.contains(sel.anchorNode) || !el.contains(sel.focusNode)) return;
      const picked = sel.toString().trim();
      if (!picked || picked.length > MAX_ANCHOR_CHARS) return;
      setMode("request_changes");
      setAnchor(picked);
      // A draft written for another claim would now sit under the wrong words.
      // Clear it, unless the reviewer has typed their own.
      if (!editedRef.current) setComment("");
    };
    document.addEventListener("mouseup", onSelect);
    document.addEventListener("keyup", onSelect);
    return () => {
      document.removeEventListener("mouseup", onSelect);
      document.removeEventListener("keyup", onSelect);
    };
  }, [props.copyElementId]);

  const pick = (a: Anchor | null) => {
    setAnchor(a?.quote ?? "");
    if (!edited) setComment(a?.draft ?? "");
  };

  const tab = (value: "approve" | "request_changes", label: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={
        mode === value
          ? "flex-1 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
          : "flex-1 rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
      }
    >
      {label}
    </button>
  );

  return (
    <form action={action} className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm" aria-label="Your decision">
      <input type="hidden" name="ref" value={props.adRef} />
      <input type="hidden" name="versionNumber" value={props.versionNumber} />
      <input type="hidden" name="fingerprint" value={props.fingerprint} />
      <input type="hidden" name="plannedDate" value={props.plannedDate} />
      <input type="hidden" name="placement" value={props.placement} />
      <input type="hidden" name="offerRevisionId" value={props.offerRevisionId} />
      <input type="hidden" name="seenMismatches" value={mismatches} />
      <input type="hidden" name="kind" value={mode ?? ""} />
      <input type="hidden" name="anchor" value={mode === "request_changes" ? anchor : ""} />

      <h2 className="text-base font-semibold">Your decision on version {props.versionNumber}</h2>
      <div className="mt-3 flex gap-1 rounded-lg bg-slate-100 p-1">
        {tab("request_changes", "Request changes")}
        {tab("approve", "Approve this version")}
      </div>

      {mode === null ? (
        <p className="mt-4 text-sm text-slate-700">
          {props.aiFindings > 0
            ? `The AI pointed to ${props.aiFindings === 1 ? "one thing" : `${props.aiFindings} things`} in this ad beyond the number check. Read ${props.aiFindings === 1 ? "it" : "them"} above, then choose: request changes, or approve this version.`
            : "Choose how to decide: request changes, or approve this version."}
        </p>
      ) : mode === "request_changes" ? (
        <div className="mt-4 space-y-3">
          <fieldset>
            <legend className="text-sm font-medium text-slate-800">What is the request about?</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {anchors.map((a) => (
                <button
                  key={a.quote}
                  type="button"
                  onClick={() => pick(a)}
                  aria-pressed={anchor === a.quote}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    anchor === a.quote
                      ? "border-indigo-600 bg-indigo-50 text-indigo-900"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {a.quote.length > 48 ? a.quote.slice(0, 46) + "..." : a.quote}
                </button>
              ))}
              <button
                type="button"
                onClick={() => pick(null)}
                aria-pressed={anchor === ""}
                className={`rounded-full border px-3 py-1 text-sm ${
                  anchor === "" ? "border-indigo-600 bg-indigo-50 text-indigo-900" : "border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                The whole ad
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Or select any words in the ad to anchor the request to them.
              {anchor && !anchors.some((a) => a.quote === anchor) ? (
                <span className="mt-1 block text-sm text-slate-800">
                  About: <q>{anchor}</q>
                </span>
              ) : null}
            </p>
          </fieldset>
          <label className="block">
            <span className="text-sm font-medium text-slate-800">Request to the marketer</span>
            <textarea
              name="comment"
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                setEdited(true);
                editedRef.current = true;
              }}
              rows={5}
              maxLength={props.maxComment}
              required
              placeholder="Say what to change and why, so the marketer can fix it in one round."
              className={TEXT_BOX}
            />
          </label>
          {!edited && comment ? (
            <p className="text-xs text-slate-500">
              {anchors.find((a) => a.quote === anchor)?.source === "ai" ? "Drafted by AI." : "Drafted from the offer check."}{" "}
              Edit it freely: you own the words.
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {pending ? "Sending..." : "Request changes"}
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-slate-700">{props.covers}</p>
          {mismatches > 0 ? (
            <label className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-950">
              <input type="checkbox" name="acknowledge" className="mt-0.5 h-4 w-4" />
              <span>
                {mismatches} claim{mismatches === 1 ? "" : "s"} in this version {mismatches === 1 ? "does" : "do"} not match the
                offer. Approve anyway. This is recorded with the approval.
              </span>
            </label>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            {pending ? "Recording..." : `Approve version ${props.versionNumber}`}
          </button>
        </div>
      )}
      <FormError error={state.error} className="mt-3" />
    </form>
  );
}
