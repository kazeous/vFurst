import type { Organization } from "@vfurst/db";
import { notFound, redirect } from "next/navigation";
import { getConventionOrg } from "@/lib/convention";
import { getRequestPortalOrg } from "@/lib/portal-request";
import { getPortalUrl } from "@/lib/portal-url";

export async function resolvePortalAuthPage(
  orgSlug: string,
  path: string,
  search: Record<string, string | string[] | undefined>
): Promise<Organization> {
  const org = await getConventionOrg(orgSlug);
  if (!org) notFound();

  const requestOrg = await getRequestPortalOrg();
  if (!requestOrg || requestOrg.id !== org.id) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(search)) {
      if (Array.isArray(value)) {
        for (const item of value) query.append(key, item);
      } else if (value !== undefined) {
        query.append(key, value);
      }
    }
    const suffix = query.toString();
    redirect(getPortalUrl(org, `${path}${suffix ? `?${suffix}` : ""}`));
  }

  return org;
}
