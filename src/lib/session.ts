// The two cookies this demo uses, shared by the request proxy, the server
// actions and the workspace lookup, so their names and settings cannot drift.

/** Holds the random token that names the visitor's private workspace. */
export const WORKSPACE_COOKIE = "cp_ws";
/** Holds the view the visitor picked: reviewer or marketer. */
export const ROLE_COOKIE = "cp_role";

/** A workspace token is 32 random bytes in hex. Anything else is not a token. */
export const WORKSPACE_TOKEN = /^[a-f0-9]{64}$/;

/** Both cookies: not readable by page scripts, sent only to this site, kept for 14 days. */
export function cookieSettings() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  };
}

/** The address of one ad's page. A role switch may return to it; nothing else from a form is followed. */
export const AD_PATH = /^\/ads\/AD-\d{1,6}$/;
