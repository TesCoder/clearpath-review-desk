import { NextResponse } from "next/server";
import { runReview } from "@/lib/ai/store";
import { loadAsset } from "@/lib/data";
import { getWorkspaceId } from "@/lib/workspace";

// Starts the AI claim finder for an ad's latest version. A plain route, not a
// server action, so a reviewer's decision is never queued behind a model call.
// It takes only the ad's reference; the workspace comes from the cookie.
export async function POST(request: Request) {
  // Same-origin only. The workspace cookie is SameSite=Lax, so another site's
  // POST would arrive without it anyway; this makes the rule explicit.
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  let originHost: string | null = null;
  try {
    originHost = origin ? new URL(origin).host : null;
  } catch {
    originHost = null; // "null" and other unparseable origins
  }
  if (!host || originHost !== host) {
    return NextResponse.json({ status: "unavailable", reason: "Cross-site requests are not accepted." }, { status: 403 });
  }
  let ref = "";
  try {
    const body = (await request.json()) as { ref?: unknown };
    ref = typeof body.ref === "string" ? body.ref.slice(0, 20) : "";
  } catch {
    return NextResponse.json({ status: "unavailable", reason: "Bad request." }, { status: 400 });
  }
  let workspaceId: string;
  try {
    workspaceId = await getWorkspaceId();
  } catch {
    return NextResponse.json({ status: "unavailable", reason: "No demo workspace. Reload the page." }, { status: 401 });
  }
  const asset = await loadAsset(workspaceId, ref);
  if (!asset) return NextResponse.json({ status: "unavailable", reason: "That ad is not in your workspace." }, { status: 404 });
  const review = await runReview(workspaceId, asset);
  return NextResponse.json({ status: review.status, reason: review.reason });
}
