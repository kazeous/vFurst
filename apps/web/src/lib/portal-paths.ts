import { safeReturnTo } from "@/lib/return-to";

export function portalLoginPath(returnTo: string): string {
  return `/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo, "/"))}`;
}

export function portalSignupPath(returnTo: string): string {
  return `/signup?returnTo=${encodeURIComponent(safeReturnTo(returnTo, "/"))}`;
}
