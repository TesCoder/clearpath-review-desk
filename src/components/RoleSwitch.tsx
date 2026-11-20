"use client";

import { usePathname } from "next/navigation";
import type { Role } from "@/lib/status";

const AD_PAGE = /^\/ads\/AD-\d{1,6}$/;

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
  return AD_PAGE.test(pathname) ? <input type="hidden" name="next" value={pathname} /> : null;
}

export function RoleHint({ role }: { role: Role }) {
  const pathname = usePathname();
  return <>{AD_PAGE.test(pathname) ? HINT[role].ad : HINT[role].list}</>;
}
