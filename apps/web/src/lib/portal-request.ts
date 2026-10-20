import type { Organization } from "@vfurst/db";
import { headers } from "next/headers";
import { getConventionOrg } from "@/lib/convention";
import { lookupPortalHostOrganization, type PortalHostOrganization } from "@/lib/portal-host-directory";

export function isSecureRequest(requestHeaders: Headers): boolean {
  return requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase() === "https";
}

export async function getRequestPortalOrg(): Promise<Organization | null> {
  const requestHeaders = await headers();
  const slug = requestHeaders.get("x-vfurst-org-slug");
  return slug ? getConventionOrg(slug) : null;
}

/** For read-only portal JSON routes only; uses the host directory's bounded cache. */
export async function getCachedRequestPortalOrg(): Promise<PortalHostOrganization | null> {
  const requestHeaders = await headers();
  const slug = requestHeaders.get("x-vfurst-org-slug");
  return slug ? lookupPortalHostOrganization(slug) : null;
}
