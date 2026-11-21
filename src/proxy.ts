import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { WORKSPACE_COOKIE, WORKSPACE_TOKEN, cookieSettings } from "./lib/session";

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Two jobs, on every page request:
// 1. Give each visitor their own demo workspace. The token is random and
//    unguessable, and the page's scripts cannot read it (httpOnly).
// 2. Send a content security policy. Ad copy and model output are untrusted
//    text; even if some of it were ever rendered as markup, the browser would
//    refuse to run inline script or load anything from another origin.
export function proxy(request: NextRequest) {
  // A fresh value for every response. Only script tags that carry it may run,
  // so text that reaches the page cannot become script. Base64 is the form
  // the policy header expects.
  const nonce = btoa(randomHex(16));
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // The dev server's own tooling applies inline styles; production allows none.
    isDev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const existing = request.cookies.get(WORKSPACE_COOKIE)?.value;
  const hasWorkspace = Boolean(existing && WORKSPACE_TOKEN.test(existing));
  const token = hasWorkspace ? null : randomHex(32);
  if (token) {
    // Make the new cookie visible to this same request's render.
    const others = request.cookies
      .getAll()
      .filter((c) => c.name !== WORKSPACE_COOKIE)
      .map((c) => `${c.name}=${c.value}`);
    requestHeaders.set("cookie", [...others, `${WORKSPACE_COOKIE}=${token}`].join("; "));
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  if (token) {
    response.cookies.set({ name: WORKSPACE_COOKIE, value: token, ...cookieSettings() });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
