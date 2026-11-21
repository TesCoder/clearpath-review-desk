// Runs against a local Postgres only (the DATABASE_URL in .env.local, when it
// points at localhost). It is skipped anywhere else, so it never touches the
// hosted database. Every row it creates belongs to two throwaway workspaces
// that it removes at the end.
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

function localDatabaseUrl(): string | null {
  let url = process.env.DATABASE_URL ?? null;
  if (!url && existsSync(".env.local")) {
    const m = /^DATABASE_URL=(.+)$/m.exec(readFileSync(".env.local", "utf8"));
    url = m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
  }
  return url && /@?(localhost|127\.0\.0\.1)[:/]/.test(url) ? url : null;
}

const url = localDatabaseUrl();

describe.skipIf(!url)("an added offer revision belongs to one demo workspace (local database)", () => {
  type Mods = {
    db: typeof import("./db").db;
    data: typeof import("./data");
    sheet: typeof import("./offer-sheet");
    seed: typeof import("./seed");
  };
  let m: Mods;
  let a = "";
  let b = "";
  const raise = { aprMin: 9.49, aprMax: 35.99, feePct: 2, effectiveFrom: "2026-12-01" };

  const newWorkspace = async () => {
    const sql = m.db();
    const hash = createHash("sha256").update(randomBytes(32)).digest("hex");
    const [row] = await sql`insert into workspaces (token_hash) values (${hash}) returning id`;
    await m.seed.seedWorkspace(sql, row.id);
    return row.id as string;
  };
  const status = async (ws: string, ref: string) => (await m.data.loadAsset(ws, ref))?.status;

  beforeAll(async () => {
    process.env.DATABASE_URL = url!;
    m = { db: (await import("./db")).db, data: await import("./data"), sheet: await import("./offer-sheet"), seed: await import("./seed") };
    a = await newWorkspace();
    b = await newWorkspace();
  });

  afterAll(async () => {
    const sql = m.db();
    await sql`delete from assets where workspace_id in ${sql([a, b])}`;
    await sql`delete from workspaces where id in ${sql([a, b])}`;
    await sql.end();
  });

  it("before any change, both workspaces see the same shared sheet and AD-1038 is approved", async () => {
    expect((await m.data.loadRevisions(a)).map((r) => r.revisionId)).toEqual((await m.data.loadRevisions(b)).map((r) => r.revisionId));
    expect(await status(a, "AD-1038")).toBe("approved");
  });

  it("adding a revision creates a new one, and reports the approved ad it sent back", async () => {
    const result = await m.sheet.addRevision(a, "pl-winter", raise);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.revision).toBe(3);
    expect(result.affected).toEqual(["AD-1038"]); // approved for Dec 3, 2026
    const ad = (await m.data.loadAsset(a, "AD-1038"))!;
    expect(ad.status).toBe("offer_changed");
    expect(ad.terms?.revisionId).toBe(result.revisionId);
    expect(ad.approvedAgainst?.revisionId).toBe("pl-winter-r1");
    // The same words, re-checked in code against the new terms: 8.99% is now below the 9.49% floor.
    expect(ad.analysis?.mismatches).toBe(1);
    expect(ad.analysis?.checks.find((c) => c.status === "mismatch")?.suggestion).toBe("9.49% APR");
  });

  it("the other workspace is untouched: it sees no new revision and its approval still holds", async () => {
    expect((await m.data.loadRevisions(b)).some((r) => r.addedHere)).toBe(false);
    expect(await status(b, "AD-1038")).toBe("approved");
    expect((await m.data.loadAsset(b, "AD-1038"))?.terms?.revisionId).toBe("pl-winter-r1");
  });

  it("the shared reference rows were not edited", async () => {
    const rows = await m.db()`
      select id, effective_from::text, effective_to::text, apr_min from offer_revisions
      where workspace_id is null and offer_id = 'pl-winter' order by revision
    `;
    expect(rows.map((r) => [r.id, r.effective_from, r.effective_to, Number(r.apr_min)])).toEqual([
      ["pl-winter-r1", "2026-11-01", "2026-12-31", 8.99],
      ["pl-winter-r2", "2027-01-01", null, 9.49],
    ]);
  });

  it("ads that were not approved are not reported, and ads on other dates keep their status", async () => {
    expect(await status(a, "AD-1041")).toBe("revised"); // in review: now checked against the new terms
    expect((await m.data.loadAsset(a, "AD-1041"))?.terms?.revision).toBe(3);
    expect(await status(a, "AD-1033")).toBe("rescheduled"); // Jan 12, 2027: revision 2 still applies
    expect((await m.data.loadAsset(a, "AD-1033"))?.terms?.revisionId).toBe("pl-winter-r2");
  });

  it("no AI call is made by the change", async () => {
    const [calls] = await m.db()`select count(*)::int as n from ai_calls where workspace_id = ${a}`;
    expect(calls.n).toBe(0);
  });

  it("refuses the terms already in effect, another product, and a rate above the ceiling", async () => {
    expect(await m.sheet.addRevision(a, "pl-winter", raise)).toMatchObject({ ok: false, error: expect.stringMatching(/already in effect/) });
    expect(await m.sheet.addRevision(a, "cc-everyday", raise)).toMatchObject({ ok: false, error: expect.stringMatching(/personal-loan offers only/) });
    expect(await m.sheet.addRevision(a, "pl-winter", { ...raise, aprMin: 40 })).toMatchObject({ ok: false });
    expect(await m.sheet.addRevision(a, "no-such-offer", raise)).toMatchObject({ ok: false });
  });

  it("a second workspace can add its own revision 3 without clashing", async () => {
    const result = await m.sheet.addRevision(b, "pl-winter", { ...raise, aprMin: 10.25 });
    expect(result).toMatchObject({ ok: true, revision: 3 });
    expect((await m.data.loadAsset(a, "AD-1038"))?.terms?.aprMin).toBe(9.49);
    expect((await m.data.loadAsset(b, "AD-1038"))?.terms?.aprMin).toBe(10.25);
  });

  it("an offer change and a decision in flight on one ad wait for each other in order, with no deadlock", async () => {
    const sql = m.db();
    const ad = (await m.data.loadAsset(b, "AD-1042"))!;
    let adding: ReturnType<typeof m.sheet.addRevision> | null = null;
    // What a decision does: lock its ad, then write an event that references the workspace.
    await sql.begin(async (tx) => {
      await tx`select id from assets where id = ${ad.id} for update`;
      adding = m.sheet.addRevision(b, "pl-winter", { ...raise, aprMin: 10.5, effectiveFrom: "2026-12-05" });
      await new Promise((r) => setTimeout(r, 400)); // the offer change is now waiting for this ad
      await tx`
        insert into events (workspace_id, asset_id, type, actor_role, data)
        values (${b}, ${ad.id}, 'approved', 'reviewer', '{}'::jsonb)
      `;
    });
    expect(await adding!).toMatchObject({ ok: true, revision: 4 });
  });

  it("Reset demo removes the added revision, a decision made against it and its stored AI result, and leaves the other workspace alone", async () => {
    const sql = m.db();
    const ad = (await m.data.loadAsset(a, "AD-1038"))!;
    const added = ad.terms!.revisionId;
    // An approval against the added revision, and an AI result stored for it.
    await sql`
      insert into decisions (version_id, kind, fingerprint, offer_revision_id, planned_date, placement, reviewer)
      values (${ad.latest.id}, 'approve', ${ad.latest.fingerprint}, ${added}, ${ad.plannedDate}, ${ad.placement}, 'Test')
    `;
    expect(await status(a, "AD-1038")).toBe("approved");
    await sql`
      insert into ai_reviews (fingerprint, offer_revision_id, placement, prompt_version, status, findings, dropped, missed, model)
      values (${ad.latest.fingerprint}, ${added}, ${ad.placement}, 'test', 'complete', '[]'::jsonb, 0, '[]'::jsonb, 'test')
    `;
    // Something the app never writes, but an older copy of the code could: a
    // decision in another workspace that points at this workspace's revision.
    const foreign = (await m.data.loadAsset(b, "AD-1042"))!;
    await sql`
      insert into decisions (version_id, kind, fingerprint, offer_revision_id, planned_date, placement, reviewer)
      values (${foreign.latest.id}, 'request_changes', ${foreign.latest.fingerprint}, ${added}, ${foreign.plannedDate}, ${foreign.placement}, 'Test')
    `;
    await sql.begin((tx) => m.seed.resetWorkspaceData(tx, a)); // must not be stopped by that row
    const [pinned] = await sql`select count(*)::int as n from decisions where offer_revision_id = ${added}`;
    expect(pinned.n).toBe(0);
    expect((await m.data.loadRevisions(a)).some((r) => r.addedHere)).toBe(false);
    expect(await status(a, "AD-1038")).toBe("approved");
    expect((await m.data.loadAsset(a, "AD-1038"))?.terms?.revisionId).toBe("pl-winter-r1");
    const [left] = await sql`select count(*)::int as n from ai_reviews where offer_revision_id = ${added}`;
    expect(left.n).toBe(0);
    expect((await m.data.loadRevisions(b)).filter((r) => r.addedHere).length).toBe(2); // the other workspace keeps both of its own
  });

  it("the note that the marketer ran the wording check is shown only while the ad keeps the placement and terms it was checked for", async () => {
    const sql = m.db();
    const ad = (await m.data.loadAsset(a, "AD-1042"))!; // Dec 10, 2026, a blog article, on revision 1 after the reset
    await sql`
      update versions set wording_state = 'nothing', wording_notes = 0,
        wording_revision_id = ${ad.terms!.revisionId}, wording_placement = ${ad.placement}
      where id = ${ad.latest.id}
    `;
    expect((await m.data.loadAsset(a, "AD-1042"))?.latest.wording).toEqual({ state: "nothing", notes: 0 });
    // The marketer moves it to another placement: the AI never read it for that one.
    await sql`update assets set placement = 'Email newsletter' where id = ${ad.id}`;
    expect((await m.data.loadAsset(a, "AD-1042"))?.latest.wording).toBeNull();
    await sql`update assets set placement = ${ad.placement} where id = ${ad.id}`;
    expect((await m.data.loadAsset(a, "AD-1042"))?.latest.wording).not.toBeNull();
    // The offer changes for its date: the AI never read it against the new terms.
    expect(await m.sheet.addRevision(a, "pl-winter", { ...raise, effectiveFrom: "2026-12-09" })).toMatchObject({ ok: true });
    expect((await m.data.loadAsset(a, "AD-1042"))?.latest.wording).toBeNull();
    await sql.begin((tx) => m.seed.resetWorkspaceData(tx, a));
  });

  it("stops at the demo's limit of added revisions", async () => {
    let last: Awaited<ReturnType<typeof m.sheet.addRevision>> = { ok: false, error: "" };
    for (let i = 0; i < 14; i++) {
      last = await m.sheet.addRevision(a, "pl-winter", { ...raise, aprMin: 9 + i / 100 });
      if (!last.ok) break;
    }
    expect(last).toMatchObject({ ok: false, error: expect.stringMatching(/limit of added offer revisions/) });
    expect((await m.data.loadRevisions(a)).filter((r) => r.addedHere).length).toBe(12);
  });
});
