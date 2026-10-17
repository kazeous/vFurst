import type { Organization } from "@vfurst/db";
import { getCanonicalTenantHostname, normalizeApplicationPath } from "@vfurst/tenant-context";
import { getTenantHostPolicy } from "./tenant-host-policy";

export type PortalUrlOrganization = Pick<Organization, "subdomain" | "customDomain" | "customDomainStatus">;

export function getPortalOrigin(org: PortalUrlOrganization): string {
  const appUrl = new URL(process.env.NEXT_PUBLIC_APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000");
  const hostname = getCanonicalTenantHostname(
    { subdomain: org.subdomain, customDomain: org.customDomainStatus === "ACTIVE" ? org.customDomain : null },
    getTenantHostPolicy()
  );

  return `${appUrl.protocol}//${hostname}${appUrl.port ? `:${appUrl.port}` : ""}`;
}

export function getPortalUrl(org: PortalUrlOrganization, path: string): string {
  return `${getPortalOrigin(org)}${normalizeApplicationPath(path)}`;
}
