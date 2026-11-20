import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const WORKSPACE_COOKIE = "cp_ws";

function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Gives every visitor their own demo workspace. The token is random and
// unguessable, and the page's scripts cannot read it (httpOnly).
export function proxy(request: NextRequest) {
  const existing = request.cookies.get(WORKSPACE_COOKIE)?.value;
  if (existing && /^[a-f0-9]{64}$/.test(existing)) {
    return NextResponse.next();
  }
  const token = newToken();
  // Make the new cookie visible to this same request's render.
  request.cookies.set(WORKSPACE_COOKIE, token);
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set({
    name: WORKSPACE_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
