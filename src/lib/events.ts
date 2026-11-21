import "server-only";
import type { Executor } from "./db";
import type { Role } from "./status";

/** Everything the append-only log records. The Measures page counts from these. */
export type EventType =
  | "submitted"
  | "resubmitted"
  | "approved"
  | "changes_requested"
  | "rescheduled"
  | "offer_changed" // on an ad: a new offer revision took its approval away
  | "offer_revised" // on the workspace: an offer revision was added
  | "wording_checked"; // on the workspace: a draft went through the marketer's AI wording check

/** Adds one line to the log, inside the caller's transaction so it is written only if the change it describes is. */
export async function logEvent(
  sql: Executor,
  workspaceId: string,
  event: { type: EventType; actor: Role; assetId?: string; versionId?: string; data?: Parameters<Executor["json"]>[0] },
): Promise<void> {
  await sql`
    insert into events (workspace_id, asset_id, version_id, type, actor_role, data)
    values (${workspaceId}, ${event.assetId ?? null}, ${event.versionId ?? null}, ${event.type}, ${event.actor},
            ${sql.json(event.data ?? {})})
  `;
}
