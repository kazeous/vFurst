import type { Organization } from "@vfurst/db";
import { headers } from "next/headers";
import { getConventionOrg } from "@/lib/convention";

export function isSecureRequest(requestHeaders: Headers): boolean {
  return requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase() === "https";
}

export async function getRequestPortalOrg(): Promise<Organization | null> {
  const requestHeaders = await headers();
  const slug = requestHeaders.get("x-vfurst-org-slug");
  return slug ? getConventionOrg(slug) : null;
}
