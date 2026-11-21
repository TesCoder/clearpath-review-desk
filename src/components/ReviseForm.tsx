"use client";

import { useActionState, useState } from "react";
import { submitRevision, type FormState } from "@/app/actions";
import { MAX_NOTE_CHARS, type OfferTerms } from "@/lib/checks";
import { CopyEditor } from "./CopyEditor";
import { WordingCheck } from "./WordingCheck";
import { FormError, TEXT_BOX } from "./form";

export function ReviseForm({
  adRef,
  currentBody,
  baseFingerprint,
  nextVersion,
  terms,
  dateLabel,
  afterApproval,
  offerId,
  plannedDate,
  placement,
}: {
  adRef: string;
  currentBody: string;
  /** The fingerprint of the text this edit started from. The server refuses the edit if a newer version exists. */
  baseFingerprint: string;
  nextVersion: number;
  terms: OfferTerms | null;
  dateLabel: string;
  afterApproval: boolean;
  /** What the ad is checked against, for the optional wording check. */
  offerId: string;
  plannedDate: string;
  placement: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitRevision, { error: null });
  const [body, setBody] = useState(currentBody);
  const unchanged = body === currentBody;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="ref" value={adRef} />
      <input type="hidden" name="baseFingerprint" value={baseFingerprint} />
      {afterApproval ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950">
          This ad is approved as it stands. Changing the text creates version {nextVersion}, which must be approved before it
          can be published. The approval stays with the current text.
        </p>
      ) : null}
      <CopyEditor value={body} onChange={setBody} terms={terms} dateLabel={dateLabel} />
      <WordingCheck body={body} offerId={offerId} plannedDate={plannedDate} placement={placement} ready={Boolean(terms)} />
      <label className="block">
        <span className="text-sm font-medium text-slate-800">What you changed (optional)</span>
        <textarea
          name="note"
          rows={2}
          maxLength={MAX_NOTE_CHARS}
          className={TEXT_BOX}
        />
      </label>
      <FormError error={state.error} />
      <button
        type="submit"
        disabled={pending || unchanged}
        className="w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Sending..." : `Send version ${nextVersion} for review`}
      </button>
      {unchanged ? <p className="text-xs text-slate-500">Change the text above to send a new version.</p> : null}
    </form>
  );
}
