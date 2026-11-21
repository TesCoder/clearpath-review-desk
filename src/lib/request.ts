/**
 * Same-origin only. The workspace cookie is SameSite=Lax, so another site's
 * POST would arrive without it anyway; this makes the rule explicit.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  let parsed: URL | null = null;
  try {
    parsed = origin ? new URL(origin) : null;
  } catch {
    parsed = null; // "null" and other unparseable origins
  }
  if (!host || !parsed || parsed.host !== host) return false;
  // An origin is a scheme, a host and a port. The site is served over https
  // only; plain http is accepted only for a server on this machine.
  return parsed.protocol === "https:" || (parsed.protocol === "http:" && /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host));
}

/**
 * Reads a JSON object from a request body and stops reading as soon as the
 * body is larger than `maxBytes`, so an oversized body is never held in
 * memory or parsed. Returns null when the body is too large, is not JSON, or
 * is not an object.
 */
export async function readJsonObject(request: Request, maxBytes: number): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
