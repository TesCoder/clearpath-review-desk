import { DiffView } from "@/components/CopyView";
import type { AiFinding } from "@/lib/ai/types";
import type { AssetView, VersionView } from "@/lib/data";
import { diffWords, hasAdditions, hasChanges } from "@/lib/diff";
import { addedSentences, reviewRevision, type RequestOutcome } from "@/lib/revision";
import { Badge, CHECK, Card } from "./ui";

const OUTCOME: Record<
  RequestOutcome["outcome"],
  { label: string; cls: string }
> = {
  requested_present: {
    label: "Requested figure is present",
    cls: "bg-emerald-100 text-emerald-900",
  },
  removed: { label: "Flagged claim removed", cls: "bg-emerald-100 text-emerald-900" },
  not_resolved: { label: "Still does not match", cls: "bg-red-100 text-red-900" },
  unchanged: { label: "Not changed", cls: "bg-red-100 text-red-900" },
  check_passes: {
    label: "Check passes, confirm the rest",
    cls: "bg-sky-100 text-sky-900",
  },
  changed: {
    label: "Wording changed, please confirm",
    cls: "bg-amber-100 text-amber-900",
  },
};

/**
 * Drops the opening "The ad says ..." sentence when the claim is already
 * quoted beside it. It relies on the shape of the messages written in
 * checkClaim (src/lib/checks.ts): "The ad says X. The <offer> ...". A message
 * of any other shape is returned whole.
 */
function withoutLead(message: string): string {
  const at = message.indexOf(". The ");
  return message.startsWith("The ad says") && at > 0
    ? message.slice(at + 2)
    : message;
}

/**
 * What a reviewer needs on a revised ad: each earlier request with what the
 * comparison of the two versions verified, the change word by word, and
 * anything new. The verdicts come from src/lib/revision.ts; this only lays
 * them out.
 */
export function RevisionCard({
  asset,
  previous,
  aiOnly,
}: {
  asset: AssetView;
  previous: VersionView;
  /** The AI findings shown on this screen (those beyond the code checks). */
  aiOnly: AiFinding[];
}) {
  const { latest, terms, analysis } = asset;
  const priorRequests = asset.comments.filter((c) => c.versionNumber === previous.number && c.authorRole === "reviewer");
  const revision = terms ? reviewRevision(previous.body, latest.body, priorRequests, terms) : null;
  const diff = diffWords(previous.body, latest.body);
  const flaggedNewAll = revision?.newClaims.filter((c) => c.status !== "ok") ?? [];
  // Added sentences that no code check covers. A reworded claim ("we waive the
  // fee") lands here, in front of the reviewer, not behind a green tick.
  const addedWording = addedSentences(
    previous.body,
    latest.body,
    (analysis?.claims ?? []).filter((c) => c.kind !== "unclassified"),
  );
  // A held sentence that is already listed as added wording is shown once, there.
  const flaggedNew = flaggedNewAll.filter(
    (c) => !(c.claim.kind === "unclassified" && addedWording.some((t) => t.includes(c.claim.quote))),
  );
  const aiNew = aiOnly.filter((f) => !previous.body.includes(f.quote));
  // Figures that are new in this version and agree with the offer. Shown so
  // "nothing new" is never said about a version that added a rate or a fee.
  const matchingNew = revision?.newClaims.filter((c) => c.status === "ok") ?? [];
  const onlyRemoved = hasChanges(diff) && !hasAdditions(diff);
  return (
    <Card title={`Since version ${previous.number}`} tone="attention">
      {revision && revision.outcomes.length ? (
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            What you asked for
          </h3>
          <ul className="mt-2 space-y-3">
            {revision.outcomes.map((o, i) => (
              <li
                key={i}
                className="rounded-md border border-slate-200 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm text-slate-800">
                    {o.request.anchorText ? (
                      <>
                        About{" "}
                        <q className="font-medium">
                          {o.request.anchorText}
                        </q>
                        :{" "}
                      </>
                    ) : null}
                    {o.request.body}
                  </p>
                  <Badge {...OUTCOME[o.outcome]} />
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {o.detail}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <h3
        className={`text-sm font-semibold text-slate-900 ${revision?.outcomes.length ? "mt-5" : ""}`}
      >
        What changed
      </h3>
      <div className="mt-2 rounded-md bg-slate-50 p-3">
        {hasChanges(diff) ? (
          <DiffView parts={diff} />
        ) : (
          <p className="text-sm text-slate-600">
            The text is the same as version {previous.number}.
          </p>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        <span className="rounded bg-red-100 px-1 text-red-900 line-through">
          removed
        </span>{" "}
        <span className="rounded bg-emerald-100 px-1 text-emerald-950">
          added
        </span>
      </p>
      {flaggedNew.length ? (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-slate-900">
            New in this version
          </h3>
          <ul className="mt-2 space-y-2">
            {flaggedNew.map((c, i) => (
              <li
                key={i}
                className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-red-200 bg-red-50 p-3"
              >
                <p className="text-sm text-red-950">
                  New claim, not in version {previous.number}:{" "}
                  <q className="font-medium">{c.claim.quote}</q>.{" "}
                  {withoutLead(c.message)}
                </p>
                <Badge {...CHECK[c.status]} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {addedWording.length ? (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-slate-900">Wording added in this version</h3>
          <ul className="mt-2 space-y-2">
            {addedWording.map((t, i) => (
              <li key={i} className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                <q className="font-medium">{t.replace(/[.!?]+$/, "")}</q>. The number check has nothing to compare this with. Read it
                before you decide.
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {matchingNew.length ? (
        <p className="mt-4 text-sm text-slate-700">
          Added in this version and matching the offer:{" "}
          {matchingNew.map((c, i) => (
            <span key={i}>
              {i > 0 ? ", " : ""}
              <q className="font-medium">{c.claim.quote}</q>
            </span>
          ))}
          .
        </p>
      ) : null}
      {onlyRemoved ? (
        <p className="mt-4 text-sm text-slate-600">Nothing was added in this version: words were only removed.</p>
      ) : null}
      {aiNew.length ? (
        <ul className="mt-3 space-y-2">
          {aiNew.map((f, i) => (
            <li
              key={i}
              className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-violet-200 bg-violet-50 p-3"
            >
              <p className="text-sm text-violet-950">
                New wording, not in version {previous.number}:{" "}
                <q className="font-medium">{f.quote}</q>. {f.why}
              </p>
              <Badge
                label="Found by AI"
                cls="bg-violet-100 text-violet-900"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
