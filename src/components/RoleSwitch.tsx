"use client";

import { usePathname } from "next/navigation";
import { useFormStatus } from "react-dom";
import { AD_PATH } from "@/lib/session";
import type { Role } from "@/lib/status";


const HINT: Record<Role, { list: string; ad: string }> = {
  reviewer: {
    list: "You are the compliance reviewer. Try this: open AD-1041, a revised ad. See what changed, then approve it or request changes.",
    ad: "You are the compliance reviewer. Decide on this version: approve it or request changes. Switch to Marketer to see this same ad from their side.",
  },
  marketer: {
    list: "You are the marketer. Try this: open the ad with changes requested, fix it and send it back for review.",
    ad: "You are the marketer. If changes were requested, fix the ad here and send it back. Switch to Reviewer to see this same ad from their side.",
  },
};

/** Carries the current ad through a role switch, so the same ad opens in the other view. */
export function StayOnAd() {
  const pathname = usePathname();
  return AD_PATH.test(pathname) ? <input type="hidden" name="next" value={pathname} /> : null;
}

export function RoleHint({ role }: { role: Role }) {
  const pathname = usePathname();
  return <>{AD_PATH.test(pathname) ? HINT[role].ad : HINT[role].list}</>;
}

/**
 * The two view buttons. A switch is a round trip to the server (it sets a
 * cookie and loads the other view), which takes about a second on the hosted
 * demo. The button that was clicked is drawn as chosen at once, so the click
 * never looks ignored. `aria-pressed` still follows the view the server is
 * actually showing, and `aria-busy` marks the wait.
 */
export function RoleTabs({ role }: { role: Role }) {
  const { pending, data } = useFormStatus();
  const asked = pending ? data?.get("role") : null;
  const shown: Role = asked === "marketer" || asked === "reviewer" ? asked : role;
  const tab = (value: Role, label: string) => (
    <button
      type="submit"
      name="role"
      value={value}
      aria-pressed={role === value}
      aria-busy={pending && shown === value ? true : undefined}
      data-shown={shown === value ? "true" : undefined}
      className={
        shown === value
          ? `rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white${pending ? " opacity-80" : ""}`
          : "rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
      }
    >
      {label}
    </button>
  );
  return (
    <>
      {tab("reviewer", "Reviewer")}
      {tab("marketer", "Marketer")}
    </>
  );
}
