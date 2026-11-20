import "server-only";
import { db } from "./db";
import { analyzeCopy, type CopyAnalysis, type OfferTerms } from "./checks";
import { termsOn, type RevisionTerms } from "./offers";
import { deriveStatus, type AssetState, type AssetStatus, type DecisionRecord } from "./status";

export type VersionView = {
  id: string;
  number: number;
  body: string;
  fingerprint: string;
  note: string | null;
  createdAt: string;
};

export type DecisionView = DecisionRecord & { id: string; reviewer: string };

export type CommentView = {
  id: string;
  versionNumber: number;
  decisionId: string | null;
  anchorText: string | null;
  body: string;
  authorRole: "reviewer" | "marketer";
  createdAt: string;
};

export type AssetView = {
  id: string;
  ref: string;
  title: string;
  affiliate: { id: string; name: string; kind: string };
  offer: { id: string; product: string; campaign: string };
  placement: string;
  plannedDate: string;
  createdAt: string;
  versions: VersionView[];
  latest: VersionView;
  decisions: DecisionView[];
  comments: CommentView[];
  /** Offer terms in effect on the planned publication date. */
  terms: RevisionTerms | null;
  /** Code checks of the latest version against those terms. */
  analysis: CopyAnalysis | null;
  state: AssetState;
  status: AssetStatus;
  /** When the ad last changed hands (a submission, a decision or a move). */
  lastActivityAt: string;
};

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : String(d));
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

type RevisionRow = Record<string, unknown>;

function toTerms(r: RevisionRow): OfferTerms {
  return {
    revisionId: r.id as string,
    campaign: r.campaign as string,
    effectiveFrom: r.effective_from as string,
    effectiveTo: (r.effective_to as string | null) ?? null,
    aprMin: num(r.apr_min),
    aprMax: num(r.apr_max),
    feePct: num(r.origination_fee_pct),
    termMinMonths: num(r.term_min_months),
    termMaxMonths: num(r.term_max_months),
    source: r.source as string,
  };
}

/** Every revision of every offer. Trusted reference data, the same for all visitors. */
export type { RevisionTerms };

export async function loadRevisions(): Promise<RevisionTerms[]> {
  const rows = await db()`
    select r.id, r.offer_id, r.revision, r.effective_from::text, r.effective_to::text,
           r.apr_min, r.apr_max, r.origination_fee_pct, r.term_min_months, r.term_max_months,
           r.source, o.campaign
    from offer_revisions r join offers o on o.id = r.offer_id
    order by r.offer_id, r.revision
  `;
  return rows.map((r) => ({ ...toTerms(r), offerId: r.offer_id as string, revision: r.revision as number }));
}

export async function loadOffers() {
  const rows = await db()`select id, product, campaign from offers order by product`;
  return rows.map((r) => ({ id: r.id as string, product: r.product as string, campaign: r.campaign as string }));
}

export async function loadAffiliates() {
  const rows = await db()`select id, name, kind from affiliates order by name`;
  return rows.map((r) => ({ id: r.id as string, name: r.name as string, kind: r.kind as string }));
}

/** All ads in one workspace, newest activity first. */
export async function loadAssets(workspaceId: string): Promise<AssetView[]> {
  const sql = db();
  const [assets, versions, decisions, comments, activity, revisions] = await Promise.all([
    sql`
      select a.id, a.ref, a.title, a.placement, a.planned_date::text, a.created_at,
             f.id as affiliate_id, f.name as affiliate_name, f.kind as affiliate_kind,
             o.id as offer_id, o.product, o.campaign
      from assets a
      join affiliates f on f.id = a.affiliate_id
      join offers o on o.id = a.offer_id
      where a.workspace_id = ${workspaceId}
    `,
    sql`
      select v.id, v.asset_id, v.number, v.body, v.fingerprint, v.note, v.created_at
      from versions v join assets a on a.id = v.asset_id
      where a.workspace_id = ${workspaceId}
      order by v.number
    `,
    sql`
      select d.id, v.asset_id, v.number as version_number, d.kind, d.fingerprint, d.offer_revision_id,
             d.planned_date::text, d.placement, d.reviewer, d.created_at
      from decisions d
      join versions v on v.id = d.version_id
      join assets a on a.id = v.asset_id
      where a.workspace_id = ${workspaceId}
      order by d.created_at
    `,
    sql`
      select c.id, v.asset_id, v.number as version_number, c.decision_id, c.anchor_text, c.body,
             c.author_role, c.created_at
      from comments c
      join versions v on v.id = c.version_id
      join assets a on a.id = v.asset_id
      where a.workspace_id = ${workspaceId}
      order by c.created_at
    `,
    sql`
      select asset_id, max(created_at) as at from events
      where workspace_id = ${workspaceId} and asset_id is not null
      group by asset_id
    `,
    loadRevisions(),
  ]);

  const out: AssetView[] = [];
  for (const a of assets) {
    const vs: VersionView[] = versions
      .filter((v) => v.asset_id === a.id)
      .map((v) => ({
        id: v.id,
        number: v.number,
        body: v.body,
        fingerprint: v.fingerprint,
        note: v.note,
        createdAt: iso(v.created_at),
      }));
    if (!vs.length) continue;
    const latest = vs[vs.length - 1];
    const ds: DecisionView[] = decisions
      .filter((d) => d.asset_id === a.id)
      .map((d) => ({
        id: d.id,
        versionNumber: d.version_number,
        kind: d.kind,
        fingerprint: d.fingerprint,
        offerRevisionId: d.offer_revision_id,
        plannedDate: d.planned_date,
        placement: d.placement,
        reviewer: d.reviewer,
        createdAt: iso(d.created_at),
      }));
    const cs: CommentView[] = comments
      .filter((c) => c.asset_id === a.id)
      .map((c) => ({
        id: c.id,
        versionNumber: c.version_number,
        decisionId: c.decision_id,
        anchorText: c.anchor_text,
        body: c.body,
        authorRole: c.author_role,
        createdAt: iso(c.created_at),
      }));
    const terms = termsOn(revisions, a.offer_id, a.planned_date);
    const state: AssetState = {
      latestVersion: { number: latest.number, fingerprint: latest.fingerprint },
      plannedDate: a.planned_date,
      placement: a.placement,
      currentRevisionId: terms?.revisionId ?? null,
      decisions: ds,
    };
    const last = activity.find((e) => e.asset_id === a.id);
    out.push({
      id: a.id,
      ref: a.ref,
      title: a.title,
      affiliate: { id: a.affiliate_id, name: a.affiliate_name, kind: a.affiliate_kind },
      offer: { id: a.offer_id, product: a.product, campaign: a.campaign },
      placement: a.placement,
      plannedDate: a.planned_date,
      createdAt: iso(a.created_at),
      versions: vs,
      latest,
      decisions: ds,
      comments: cs,
      terms,
      analysis: terms ? analyzeCopy(latest.body, terms) : null,
      state,
      status: deriveStatus(state),
      lastActivityAt: last ? iso(last.at) : latest.createdAt,
    });
  }
  return out.sort((x, y) => y.lastActivityAt.localeCompare(x.lastActivityAt));
}

export async function loadAsset(workspaceId: string, ref: string): Promise<AssetView | null> {
  const all = await loadAssets(workspaceId);
  return all.find((a) => a.ref === ref) ?? null;
}
