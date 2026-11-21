import { NextResponse } from "next/server";
import { runReview } from "@/lib/ai/store";
import { loadAsset } from "@/lib/data";
import { isSameOrigin, readJsonObject } from "@/lib/request";
import { getWorkspaceId } from "@/lib/workspace";

// Starts the AI claim finder for an ad's latest version. A plain route, not a
// server action, so a reviewer's decision is never queued behind a model call.
// It takes only the ad's reference; the workspace comes from the cookie.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ status: "unavailable", reason: "Cross-site requests are not accepted." }, { status: 403 });
  }
  // The body is one short reference. Anything larger is refused before it is read in full.
  const body = await readJsonObject(request, 1000);
  if (!body) return NextResponse.json({ status: "unavailable", reason: "Bad request." }, { status: 400 });
  const ref = typeof body.ref === "string" ? body.ref.slice(0, 20) : "";
  let workspaceId: string;
  try {
    workspaceId = await getWorkspaceId();
  } catch {
    return NextResponse.json({ status: "unavailable", reason: "No demo workspace. Reload the page." }, { status: 401 });
  }
  const asset = await loadAsset(workspaceId, ref);
  if (!asset) return NextResponse.json({ status: "unavailable", reason: "That ad is not in your workspace." }, { status: 404 });
  const review = await runReview(workspaceId, asset);
  // `stored` tells the page whether reloading will show a result. A refused,
  // cut-off or malformed answer is not stored, so the page must say so itself.
  return NextResponse.json({ status: review.status, reason: review.reason, stored: review.answered });
}
