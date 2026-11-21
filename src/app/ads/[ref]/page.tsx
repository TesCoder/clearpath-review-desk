import Link from "next/link";
import { notFound } from "next/navigation";
import { AiFinderCard } from "@/components/ad/AiFinderCard";
import { ApprovalCard } from "@/components/ad/ApprovalCard";
import { CopyPreviewCard } from "@/components/ad/CopyPreviewCard";
import { HistoryCard } from "@/components/ad/HistoryCard";
import { ApprovalLostNotice, DoneNotice } from "@/components/ad/Notices";
import { OfferChecksCard, OfferTermsCard } from "@/components/ad/OfferCards";
import { OfferChangeCard } from "@/components/ad/OfferChangeCard";
import { RevisionCard } from "@/components/ad/RevisionCard";
import { Card } from "@/components/ad/ui";
import type { ExtraMark } from "@/components/CopyView";
import { DecisionPanel, type Anchor } from "@/components/DecisionPanel";
import { MoveForm } from "@/components/MoveForm";
import { ReviseForm } from "@/components/ReviseForm";
import { StatusPill } from "@/components/StatusPill";
import { SwitchTo } from "@/components/SwitchTo";
import { findingsBeyondChecks } from "@/lib/ai/display";
import { getStoredReview } from "@/lib/ai/store";
import type { AiFinding } from "@/lib/ai/types";
import { MAX_ANCHOR_CHARS, MAX_COMMENT_CHARS, draftRequest } from "@/lib/checks";
import { loadAsset, loadRevisions, type AssetView } from "@/lib/data";
import { shortFingerprint } from "@/lib/fingerprint";
import { formatDate, timeAgo, withArticle } from "@/lib/format";
import { coverageText } from "@/lib/offers";
import { REVIEWER_TURN } from "@/lib/status";
import { getRole, getWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

// The review screen for one ad. This file loads the ad, works out which cards
// apply to the visitor's role and the ad's status, and lays them out. Each
// card is in src/components/ad/. The rules behind them are in src/lib/.

/**
 * What a request can be about: each claim the code check read (with the
 * comment the check drafts for it), then each phrase the AI found (with the
 * comment the AI drafted). The reviewer picks one, and the draft stays editable.
 */
function anchorsFor(a: AssetView, aiOnly: AiFinding[]): Anchor[] {
  const seen = new Set<string>();
  const out: Anchor[] = [];
  for (const c of a.analysis?.checks ?? []) {
    if (seen.has(c.claim.quote)) continue;
    seen.add(c.claim.quote);
    out.push({
      quote: c.claim.quote,
      draft: draftRequest(c),
      flagged: c.status !== "ok",
      source: "check",
    });
  }
  for (const f of aiOnly) {
    if (seen.has(f.quote) || f.quote.length > MAX_ANCHOR_CHARS) continue;
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

export default async function AdPage(props: PageProps<"/ads/[ref]">) {
  const { ref } = await props.params;
  const { done } = await props.searchParams;
  const workspaceId = await getWorkspaceId();
  const [asset, role, revisions] = await Promise.all([
    loadAsset(workspaceId, decodeURIComponent(ref)),
    getRole(),
    loadRevisions(workspaceId),
  ]);
  if (!asset) notFound();

  const { latest, terms, analysis } = asset;
  const aiReview = await getStoredReview(asset);
  const aiOnly = findingsBeyondChecks(aiReview, analysis?.checks ?? []);
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
  const approval = asset.approval;
  const approvedVersion = approval
    ? asset.versions.find((v) => v.number === approval.versionNumber)
    : null;
  const approvalTerms = asset.approvedAgainst;
  const reviewerTurn = REVIEWER_TURN.includes(asset.status);
  const openRequest =
    asset.status === "changes_requested"
      ? asset.comments.filter(
          (c) =>
            c.versionNumber === latest.number && c.authorRole === "reviewer",
        )
      : [];
  const home = role === "marketer" ? "/marketer" : "/";
  // What the marketer's edit form needs, wherever on the page it appears.
  const revise = {
    adRef: asset.ref,
    currentBody: latest.body,
    baseFingerprint: latest.fingerprint,
    baseRevisionId: terms?.revisionId ?? "",
    nextVersion: latest.number + 1,
    terms,
    dateLabel: formatDate(asset.plannedDate),
    offerId: asset.offer.id,
    plannedDate: asset.plannedDate,
    placement: asset.placement,
  };
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
            <ReviseForm {...revise} afterApproval={false} />
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

      <DoneNotice done={done} asset={asset} />

      <ApprovalLostNotice asset={asset} role={role} approval={approval} approvalTerms={approvalTerms} />

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          {role === "marketer" ? requestCard : null}
          {asset.status === "offer_changed" && approvalTerms && terms ? (
            <OfferChangeCard asset={asset} approvalTerms={approvalTerms} />
          ) : null}
          {role === "reviewer" && previous && asset.status !== "offer_changed" ? (
            <RevisionCard asset={asset} previous={previous} aiOnly={aiOnly} />
          ) : null}

          <CopyPreviewCard asset={asset} extraMarks={extraMarks} />
        </div>

        <div className="space-y-6 lg:col-span-2">
          <OfferTermsCard asset={asset} />

          <OfferChecksCard asset={asset} />

          {terms ? <AiFinderCard asset={asset} role={role} aiReview={aiReview} aiOnly={aiOnly} /> : null}

          {role === "reviewer" && reviewerTurn && terms ? (
            <DecisionPanel
              key={`${latest.fingerprint}|${asset.plannedDate}|${asset.placement}|${terms.revisionId}`}
              adRef={asset.ref}
              versionNumber={latest.number}
              fingerprint={latest.fingerprint}
              plannedDate={asset.plannedDate}
              placement={asset.placement}
              offerRevisionId={terms.revisionId}
              anchors={anchorsFor(asset, aiOnly)}
              aiFindings={aiOnly.length}
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
          {role === "marketer" && asset.status === "offer_changed" && terms ? (
            <Card title="Change the text for the new terms" tone="attention">
              <ReviseForm {...revise} afterApproval={false} />
            </Card>
          ) : null}
          {role === "reviewer" ? requestCard : null}
          {approval && approvedVersion && approvalTerms ? (
            <ApprovalCard asset={asset} approval={approval} approvedVersion={approvedVersion} approvalTerms={approvalTerms} />
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
                <ReviseForm {...revise} afterApproval />
              </Card>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-6">
        <HistoryCard asset={asset} />
      </div>
    </main>
  );
}
