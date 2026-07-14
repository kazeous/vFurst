import { prisma } from "@vfurst/db";
import { headers } from "next/headers";
import { getRootDomain, normalizeHostname } from "./platform-hosts";

type ConventionHostOrganization = {
  subdomain: string;
  customDomain: string | null;
};

export function getConventionPortalRoot(hostname: string, org: ConventionHostOrganization) {
  const normalized = normalizeHostname(hostname);
  const hostedSubdomain = `${org.subdomain}.${getRootDomain()}`;

  if (normalized === hostedSubdomain || (org.customDomain && normalized === org.customDomain)) {
    return "";
  }

  return `/${org.subdomain}`;
}

export async function getConventionPortalRootForRequest(org: ConventionHostOrganization) {
  const requestHeaders = await headers();
  return getConventionPortalRoot(requestHeaders.get("x-vfurst-org-host") ?? requestHeaders.get("host") ?? "", org);
}

export async function getConventionOrg(orgSlug: string) {
  const normalized = orgSlug.trim().toLowerCase();

  if (!normalized || normalized.startsWith("_")) {
    return null;
  }

  if (normalized.includes(".")) {
    return prisma.organization.findFirst({
      where: {
        status: "ACTIVE",
        customDomain: normalized
      }
    });
  }

  return prisma.organization.findFirst({
    where: {
      status: "ACTIVE",
      OR: [{ subdomain: normalized }, { slug: normalized }]
    }
  });
}
