import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";
import { seedWorkspace } from "./seed";
import type { Role } from "./status";

const WORKSPACE_COOKIE = "cp_ws";
export const ROLE_COOKIE = "cp_role";

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * The visitor's workspace id. It comes only from the httpOnly cookie, never
 * from a form field, a URL or anything a model returns. Every query that
 * reads or writes ads is scoped by this id. A first visit creates the
 * workspace and fills it with the demo ads in one transaction.
 */
export async function getWorkspaceId(): Promise<string> {
  const token = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    throw new Error("No demo workspace cookie. Reload the page.");
  }
  const tokenHash = hashToken(token);
  const sql = db();

  const found = await sql`select id from workspaces where token_hash = ${tokenHash}`;
  if (found.length) return found[0].id as string;

  const created = await sql.begin(async (tx) => {
    const rows = await tx`
      insert into workspaces (token_hash) values (${tokenHash})
      on conflict (token_hash) do nothing
      returning id
    `;
    if (!rows.length) return null; // another request for this visitor got there first
    await seedWorkspace(tx, rows[0].id as string);
    return rows[0].id as string;
  });
  if (created) return created;

  const again = await sql`select id from workspaces where token_hash = ${tokenHash}`;
  return again[0].id as string;
}

/** Puts the visitor's workspace back to the seeded demo. */
export async function resetWorkspace(): Promise<void> {
  const workspaceId = await getWorkspaceId();
  await db().begin(async (tx) => {
    await tx`delete from events where workspace_id = ${workspaceId}`;
    await tx`delete from assets where workspace_id = ${workspaceId}`;
    await seedWorkspace(tx, workspaceId);
  });
}

/**
 * Which view the visitor picked. The demo has no sign-in, so this is a view,
 * not an account. The server still checks it on every decision.
 */
export async function getRole(): Promise<Role> {
  const value = (await cookies()).get(ROLE_COOKIE)?.value;
  return value === "marketer" ? "marketer" : "reviewer";
}
