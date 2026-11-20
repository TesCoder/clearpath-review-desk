/**
 * Same-origin only. The workspace cookie is SameSite=Lax, so another site's
 * POST would arrive without it anyway; this makes the rule explicit.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  let originHost: string | null = null;
  try {
    originHost = origin ? new URL(origin).host : null;
  } catch {
    originHost = null; // "null" and other unparseable origins
  }
  return Boolean(host) && originHost === host;
}
