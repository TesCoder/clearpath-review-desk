import Link from "next/link";
import { notFound } from "next/navigation";
import { AiRunner } from "@/components/AiRunner";
import { CopyButton } from "@/components/CopyButton";
import { CopyView, DiffView, type ExtraMark } from "@/components/CopyView";
import { DecisionPanel, type Anchor } from "@/components/DecisionPanel";
import { MoveForm } from "@/components/MoveForm";
import { ReviseForm } from "@/components/ReviseForm";
import { StatusPill } from "@/components/StatusPill";
import { SwitchTo } from "@/components/SwitchTo";
import { isAiConfigured } from "@/lib/ai/select";
import { getStoredReview } from "@/lib/ai/store";
import type { AiFinding, AiReview } from "@/lib/ai/types";
import { MAX_COMMENT_CHARS, type Check } from "@/lib/checks";
import { loadAsset, loadRevisions, type AssetView } from "@/lib/data";
import { diffWords, hasChanges } from "@/lib/diff";
import { shortFingerprint } from "@/lib/fingerprint";
import { formatDate, formatMoment, timeAgo, withArticle } from "@/lib/format";
import { reviewRevision, type RequestOutcome } from "@/lib/revision";
import { coverageText } from "@/lib/offers";
import { REVIEWER_TURN, lastApproval } from "@/lib/status";
import { getRole, getWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

function Card({
  title,
  children,
  tone,
}: {
  title: string;
  children: React.ReactNode;
  tone?: "plain" | "attention";
}) {
  return (
    <section
      className={`rounded-lg border bg-white p-4 ${tone === "attention" ? "border-indigo-300 ring-1 ring-indigo-100" : "border-slate-200"}`}
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const OUTCOME: Record<
  RequestOutcome["outcome"],
  { label: string; cls: string }
> = {
  resolved: { label: "Resolved", cls: "bg-emerald-100 text-emerald-900" },
  not_resolved: { label: "Not resolved", cls: "bg-red-100 text-red-900" },
  unchanged: { label: "Not changed", cls: "bg-red-100 text-red-900" },
  changed: {
    label: "Changed, please confirm",
    cls: "bg-amber-100 text-amber-900",
  },
};

const CHECK: Record<Check["status"], { label: string; cls: string }> = {
  mismatch: { label: "Does not match", cls: "bg-red-100 text-red-900" },
  needs_reviewer: {
    label: "Needs your eyes",
    cls: "bg-amber-100 text-amber-900",
  },
  ok: { label: "Matches", cls: "bg-emerald-100 text-emerald-900" },
};

function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

/** Drops the opening "The ad says ..." sentence when the claim is already quoted beside it. */
function withoutLead(message: string): string {
  const at = message.indexOf(". The ");
  return message.startsWith("The ad says") && at > 0
    ? message.slice(at + 2)
    : message;
}

function draftFor(c: Check): string {
  if (c.status !== "mismatch") return "";
  if (c.claim.kind === "no_fee")
    return `${c.message} Please remove this sentence or state the fee.`;
  return c.suggestion
    ? `${c.message} Please change it to ${c.suggestion}.`
    : c.message;
}

function anchorsFor(a: AssetView, aiOnly: AiFinding[]): Anchor[] {
  const seen = new Set<string>();
  const out: Anchor[] = [];
  for (const c of a.analysis?.checks ?? []) {
    if (seen.has(c.claim.quote)) continue;
    seen.add(c.claim.quote);
    out.push({
      quote: c.claim.quote,
      draft: draftFor(c),
      flagged: c.status !== "ok",
      source: "check",
    });
  }
  for (const f of aiOnly) {
    if (seen.has(f.quote) || f.quote.length > 200) continue;
    seen.add(f.quote);
    out.push({
      quote: f.quote,
      draft: f.suggestedComment,
      flagged: false,
      source: "ai",
    });
  }
  return out;
}

const KIND_LABEL: Record<AiFinding["kind"], string> = {
  rate: "Rate",
  fee: "Fee",
  approval_or_eligibility: "Approval or eligibility",
  credit_impact: "Credit score",
  speed: "Speed",
  savings_or_comparison: "Savings or comparison",
  superlative: "Superlative",
  other: "Other",
};

/** AI findings that are not already covered by a code check on the same words. */
function beyondChecks(review: AiReview | null, a: AssetView): AiFinding[] {
  const claims = a.analysis?.claims ?? [];
  return (review?.findings ?? []).filter(
    (f) => !claims.some((c) => f.start < c.end && c.start < f.end),
  );
}

export default async function AdPage(props: PageProps<"/ads/[ref]">) {
  const { ref } = await props.params;
  const { done } = await props.searchParams;
  const [asset, role, revisions] = await Promise.all([
    getWorkspaceId().then((ws) => loadAsset(ws, decodeURIComponent(ref))),
    getRole(),
    loadRevisions(),
  ]);
  if (!asset) notFound();

  const { latest, terms, analysis } = asset;
  const aiReview = await getStoredReview(asset);
  const aiOnly = beyondChecks(aiReview, asset);
  const extraMarks: ExtraMark[] = [
    ...aiOnly.map((f) => ({
      start: f.start,
      end: f.end,
      tone: "ai" as const,
      title: `Found by AI: ${f.why}`,
    })),
    ...asset.instructionText.map((f) => ({
      start: f.start,
      end: f.end,
      tone: "instruction" as const,
      title: `Addressed to the reviewer or an AI: ${f.reason}`,
    })),
  ];
  const previous =
    asset.versions.find((v) => v.number === latest.number - 1) ?? null;
  const priorRequests = previous
    ? asset.comments.filter(
        (c) =>
          c.versionNumber === previous.number && c.authorRole === "reviewer",
      )
    : [];
  const revision =
    previous && terms
      ? reviewRevision(previous.body, latest.body, priorRequests, terms)
      : null;
  const diff = previous ? diffWords(previous.body, latest.body) : null;
  const flaggedNew = revision?.newClaims.filter((c) => c.status !== "ok") ?? [];
  const aiNew = previous
    ? aiOnly.filter((f) => !previous.body.includes(f.quote))
    : [];
  const approval = lastApproval(asset.state);
  const approvedVersion = approval
    ? asset.versions.find((v) => v.number === approval.versionNumber)
    : null;
  const approvalTerms = approval
    ? revisions.find((r) => r.revisionId === approval.offerRevisionId)
    : null;
  const reviewerTurn = REVIEWER_TURN.includes(asset.status);
  const openRequest =
    asset.status === "changes_requested"
      ? asset.comments.filter(
          (c) =>
            c.versionNumber === latest.number && c.authorRole === "reviewer",
        )
      : [];
  const home = role === "marketer" ? "/marketer" : "/";
  const covered = coverageText(revisions, asset.offer.id);

  // The request and the fix form. The marketer gets it first on the page;
  // the reviewer sees it beside the offer terms.
  const requestCard =
    asset.status === "changes_requested" ? (
      <Card title="Changes requested" tone="attention">
        <ul className="space-y-2">
          {openRequest.map((c) => (
            <li key={c.id} className="text-sm text-slate-800">
              {c.anchorText ? (
                <>
                  About <q className="font-medium">{c.anchorText}</q>:{" "}
                </>
              ) : null}
              {c.body}
            </li>
          ))}
        </ul>
        {role === "reviewer" ? (
          <div className="mt-3 space-y-2 text-sm text-slate-600">
            <p>
              The ad is with the marketer. It returns to your queue when they
              submit a new version.
            </p>
            <SwitchTo
              role="marketer"
              adRef={asset.ref}
              label={`Open ${asset.ref} as the marketer`}
            />
          </div>
        ) : (
          <div className="mt-4 border-t border-slate-200 pt-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">
              Fix the ad and send it back
            </h3>
            <ReviseForm
              adRef={asset.ref}
              currentBody={latest.body}
              nextVersion={latest.number + 1}
              terms={terms}
              dateLabel={formatDate(asset.plannedDate)}
              afterApproval={false}
            />
          </div>
        )}
      </Card>
    ) : null;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
      <Link
        href={home}
        className="text-sm text-indigo-700 underline-offset-2 hover:underline"
      >
        {role === "marketer" ? "Back to your ads" : "Back to the queue"}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-2xl font-semibold">
          {asset.ref}{" "}
          <span className="font-normal text-slate-600">
            {asset.affiliate.name}: {asset.title}
          </span>
        </h1>
        <StatusPill status={asset.status} />
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Version {latest.number}, submitted {timeAgo(latest.createdAt)}. Planned
        publication {formatDate(asset.plannedDate)} as{" "}
        {withArticle(asset.placement)}.
      </p>

      {done === "approved" ? (
        <div
          className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900"
          role="status"
        >
          <span>Approved. The marketer can now see the approved copy.</span>
          <SwitchTo
            role="marketer"
            adRef={asset.ref}
            label="See it as the marketer"
          />
          <Link href="/" className="underline">
            Back to the queue
          </Link>
        </div>
      ) : null}
      {done === "requested" ? (
        <div
          className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-800"
          role="status"
        >
          <span>Request sent. The ad is with the marketer.</span>
          <SwitchTo
            role="marketer"
            adRef={asset.ref}
            label={`Open ${asset.ref} as the marketer`}
          />
          <Link href="/" className="underline">
            Back to the queue
          </Link>
        </div>
      ) : null}
      {done === "submitted" || done === "resubmitted" ? (
        <div
          className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900"
          role="status"
        >
          <span>Sent for review as version {latest.number}.</span>
          <SwitchTo
            role="reviewer"
            adRef={asset.ref}
            label={`Review version ${latest.number} as the reviewer`}
          />
        </div>
      ) : null}
      {done === "moved" ? (
        <div
          className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-800"
          role="status"
        >
          <span>
            Moved to {formatDate(asset.plannedDate)} as{" "}
            {withArticle(asset.placement)}. It is back in the review queue.
          </span>
          <SwitchTo
            role="reviewer"
            adRef={asset.ref}
            label="Review it as the reviewer"
          />
        </div>
      ) : null}

      {asset.status === "rescheduled" && approval && approvalTerms ? (
        <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <strong>Same words, new date.</strong> Version{" "}
          {approval.versionNumber} was approved for{" "}
          {formatDate(approval.plannedDate)} under offer revision{" "}
          {approvalTerms.revision}. It was then moved to{" "}
          {formatDate(asset.plannedDate)}
          {terms
            ? `, when revision ${terms.revision} applies`
            : ", when no offer terms are in effect"}
          . That approval still stands for the original date only, so this
          placement needs its own review.
        </p>
      ) : null}
      {asset.status === "edited_after_approval" && approval ? (
        <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <strong>Edited after approval.</strong> Version{" "}
          {approval.versionNumber} was approved on{" "}
          {formatMoment(approval.createdAt)}. The marketer then changed the
          text, so version {latest.number} needs its own review. The earlier
          approval stays with version {approval.versionNumber}.
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          {role === "marketer" ? requestCard : null}
          {role === "reviewer" && previous && diff ? (
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
              ) : hasChanges(diff) ? (
                <p className="mt-4 text-sm text-slate-600">
                  No new rate or fee claim was added in this version.
                </p>
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
          ) : null}

          <Card title="The ad as a consumer sees it">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {asset.affiliate.name} · {asset.placement} · Sponsored
              </p>
              <div className="mt-2">
                <CopyView
                  id="ad-copy"
                  body={latest.body}
                  checks={analysis?.checks ?? []}
                  extra={extraMarks}
                />
              </div>
            </div>
            {analysis?.hidden.length ? (
              <ul className="mt-3 space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                <li className="font-semibold">
                  This copy contains text a reader cannot see as written:
                </li>
                {analysis.hidden.map((h) => (
                  <li key={h.kind}>{h.label}.</li>
                ))}
              </ul>
            ) : null}
            {asset.instructionText.length ? (
              <ul className="mt-3 space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                <li className="font-semibold">
                  Part of this copy is written to the reviewer or to an AI, not
                  to a consumer. It has no effect on the checks or on your
                  decision:
                </li>
                {asset.instructionText.map((f, i) => (
                  <li key={i}>
                    <q>{f.quote}</q> ({f.reason}).
                  </li>
                ))}
              </ul>
            ) : null}
            {latest.note ? (
              <p className="mt-3 text-sm text-slate-700">
                <span className="font-medium">Marketer&apos;s note:</span>{" "}
                {latest.note}
              </p>
            ) : null}
            <p
              className="mt-3 font-mono text-xs text-slate-500"
              title="A fingerprint of this exact text. An approval is tied to it."
            >
              Text fingerprint {shortFingerprint(latest.fingerprint)}
            </p>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card title="Offer terms that apply">
            {terms ? (
              <>
                <p className="text-sm text-slate-800">
                  <span className="font-semibold">{terms.campaign}</span>,
                  revision {terms.revision}. In effect{" "}
                  {formatDate(terms.effectiveFrom)}
                  {terms.effectiveTo
                    ? ` to ${formatDate(terms.effectiveTo)}`
                    : " onward"}
                  , which covers the planned publication on{" "}
                  {formatDate(asset.plannedDate)}.
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-slate-500">Lowest APR</dt>
                  <dd className="font-medium">
                    {terms.aprMin !== null
                      ? `${terms.aprMin.toFixed(2)}%`
                      : "Not stated"}
                  </dd>
                  <dt className="text-slate-500">Highest APR</dt>
                  <dd className="font-medium">
                    {terms.aprMax !== null
                      ? `${terms.aprMax.toFixed(2)}%`
                      : "Not stated"}
                  </dd>
                  <dt className="text-slate-500">Origination fee</dt>
                  <dd className="font-medium">
                    {terms.feePct !== null ? `${terms.feePct}%` : "Not stated"}
                  </dd>
                  <dt className="text-slate-500">Loan terms</dt>
                  <dd className="font-medium">
                    {terms.termMinMonths !== null
                      ? `${terms.termMinMonths} to ${terms.termMaxMonths} months`
                      : "Not stated"}
                  </dd>
                </dl>
                <p className="mt-3 text-xs text-slate-500">
                  Source: {terms.source}
                </p>
              </>
            ) : (
              <p className="text-sm text-amber-900">
                No {asset.offer.campaign} terms are in effect on{" "}
                {formatDate(asset.plannedDate)}. The ad cannot be checked or
                approved for that date.
              </p>
            )}
          </Card>

          <Card title="Checks against the offer">
            {analysis && analysis.checks.length ? (
              <ul className="space-y-2">
                {analysis.checks.map((c, i) => (
                  <li
                    key={i}
                    className="flex items-start justify-between gap-2 text-sm"
                  >
                    <p className="text-slate-800">{c.message}</p>
                    <Badge {...CHECK[c.status]} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-600">
                No rate or fee found to compare with the offer. That is not a finding that the ad is fine: read the wording, and see the AI claim finder below.
              </p>
            )}
            <p className="mt-3 text-xs text-slate-500">
              Numbers are compared with the offer sheet by code, not by AI.
              Wording that is not a number still needs your judgment.
            </p>
          </Card>

          {terms ? (
            <Card title="AI claim finder">
              {aiReview ? (
                <>
                  {aiReview.status === "incomplete" ? (
                    <div
                      className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
                      role="status"
                    >
                      <p className="font-semibold">AI review incomplete</p>
                      <p className="mt-1">
                        {aiReview.reason} Do not read the AI&apos;s answer as a
                        full account of this ad. The code checks above are
                        complete and still apply.
                      </p>
                    </div>
                  ) : null}
                  {aiOnly.length ? (
                    <ul className="space-y-3">
                      {aiOnly.map((f, i) => (
                        <li key={i} className="text-sm">
                          <p className="text-slate-900">
                            <q className="font-medium">{f.quote}</q>{" "}
                            <Badge
                              label={KIND_LABEL[f.kind]}
                              cls="bg-violet-100 text-violet-900"
                            />
                          </p>
                          <p className="mt-0.5 text-slate-600">{f.why}</p>
                        </li>
                      ))}
                    </ul>
                  ) : aiReview.status === "complete" ? (
                    <p className="text-sm text-slate-700">
                      The AI pointed to nothing beyond the rate and fee checks
                      above.
                    </p>
                  ) : null}
                  <p className="mt-3 text-xs text-slate-500">
                    The AI reads for wording a number check cannot catch. Every
                    quote it gives is confirmed to be in the ad, word for word.
                    It cannot approve anything: that is your decision.
                  </p>
                </>
              ) : role === "reviewer" ? (
                <AiRunner
                  key={latest.fingerprint}
                  adRef={asset.ref}
                  configured={isAiConfigured()}
                />
              ) : (
                <p className="text-sm text-slate-600">
                  The AI reads the ad when the reviewer opens it.
                </p>
              )}
            </Card>
          ) : null}

          {role === "reviewer" && reviewerTurn && terms ? (
            <DecisionPanel
              key={latest.fingerprint}
              adRef={asset.ref}
              versionNumber={latest.number}
              fingerprint={latest.fingerprint}
              anchors={anchorsFor(asset, aiOnly)}
              mismatches={analysis?.mismatches ?? 0}
              covers={`Approving covers exactly this text (version ${latest.number}, fingerprint ${shortFingerprint(latest.fingerprint)}), checked against ${terms.campaign} revision ${terms.revision}, for publication on ${formatDate(asset.plannedDate)} as ${withArticle(asset.placement)}. Any edit, new date or new placement comes back to you.`}
              copyElementId="ad-copy"
              maxComment={MAX_COMMENT_CHARS}
            />
          ) : null}
          {!terms ? (
            <Card title="Choose a publication date" tone="attention">
              {role === "marketer" ? (
                <MoveForm
                  adRef={asset.ref}
                  plannedDate={asset.plannedDate}
                  placement={asset.placement}
                  covered={covered}
                  intro="This ad is planned for a date with no offer terms, so it cannot be reviewed. Pick a date the offer covers."
                />
              ) : (
                <div className="space-y-2 text-sm text-slate-700">
                  <p>
                    This ad is planned for a date with no offer terms, so there
                    is nothing to check it against. The marketer needs to pick
                    another date.
                  </p>
                  <SwitchTo
                    role="marketer"
                    adRef={asset.ref}
                    label={`Open ${asset.ref} as the marketer`}
                  />
                </div>
              )}
            </Card>
          ) : null}
          {role === "marketer" && reviewerTurn && terms ? (
            <Card title="Waiting for the reviewer">
              <p className="text-sm text-slate-700">
                This version is in the review queue.
              </p>
              <div className="mt-2">
                <SwitchTo
                  role="reviewer"
                  adRef={asset.ref}
                  label={`Review version ${latest.number} as the reviewer`}
                />
              </div>
            </Card>
          ) : null}
          {role === "reviewer" ? requestCard : null}
          {approval && approvedVersion && approvalTerms ? (
            <Card
              title={
                asset.status === "approved"
                  ? "Approved copy"
                  : "Earlier approval, still on record"
              }
            >
              <p
                className="whitespace-pre-wrap break-words rounded-md border border-emerald-200 bg-emerald-50 p-3 text-slate-900"
                id="approved-copy"
              >
                {approvedVersion.body}
              </p>
              <p className="mt-2 text-sm text-slate-700">
                Approved by{" "}
                {
                  asset.decisions.find(
                    (d) => d.createdAt === approval.createdAt,
                  )?.reviewer
                }{" "}
                on {formatMoment(approval.createdAt)}. Version{" "}
                {approval.versionNumber}, fingerprint{" "}
                <span className="font-mono">
                  {shortFingerprint(approval.fingerprint)}
                </span>
                , checked against {approvalTerms.campaign} revision{" "}
                {approvalTerms.revision}, for {formatDate(approval.plannedDate)}{" "}
                as {withArticle(approval.placement)}.
              </p>
              {asset.status !== "approved" ? (
                <p className="mt-2 text-sm text-amber-900">
                  This approval does not cover what is in review now. Do not
                  publish until the current version is approved.
                </p>
              ) : (
                <div className="mt-3">
                  <CopyButton text={approvedVersion.body} />
                </div>
              )}
            </Card>
          ) : null}
          {role === "marketer" && asset.status === "approved" ? (
            <>
              <Card title="Move this ad">
                <MoveForm
                  adRef={asset.ref}
                  plannedDate={asset.plannedDate}
                  placement={asset.placement}
                  covered={covered}
                />
              </Card>
              <Card title="Change the text">
                <ReviseForm
                  adRef={asset.ref}
                  currentBody={latest.body}
                  nextVersion={latest.number + 1}
                  terms={terms}
                  dateLabel={formatDate(asset.plannedDate)}
                  afterApproval
                />
              </Card>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-6">
        <Card title="History">
          <ol className="space-y-4">
            {asset.versions.map((v) => (
              <li key={v.id} className="border-l-2 border-slate-200 pl-3">
                <p className="text-sm font-medium text-slate-900">
                  Version {v.number}{" "}
                  <span className="font-normal text-slate-500">
                    submitted {formatMoment(v.createdAt)}
                  </span>
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">
                  {v.body}
                </p>
                {asset.decisions
                  .filter((d) => d.versionNumber === v.number)
                  .map((d) => (
                    <div key={d.id} className="mt-2 text-sm">
                      <p
                        className={
                          d.kind === "approve"
                            ? "font-medium text-emerald-800"
                            : "font-medium text-slate-800"
                        }
                      >
                        {d.kind === "approve"
                          ? "Approved"
                          : "Changes requested"}{" "}
                        by {d.reviewer}, {formatMoment(d.createdAt)}
                        {d.kind === "approve"
                          ? `, for ${formatDate(d.plannedDate)} as ${withArticle(d.placement)}`
                          : ""}
                      </p>
                      {asset.comments
                        .filter((c) => c.decisionId === d.id)
                        .map((c) => (
                          <p key={c.id} className="mt-1 text-slate-700">
                            {c.anchorText ? (
                              <>
                                About <q>{c.anchorText}</q>:{" "}
                              </>
                            ) : null}
                            {c.body}
                          </p>
                        ))}
                    </div>
                  ))}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </main>
  );
}
