import { prisma, type Organization } from "@vfurst/db";
import { getRootDomain, isPlatformHostname, normalizeHostname } from "./platform-hosts";

export async function resolveOrganization(hostname: string) {
  const normalized = normalizeHostname(hostname);
  const rootDomain = getRootDomain();

  if (!normalized || isPlatformHostname(normalized)) {
    return null;
  }

  if (normalized.endsWith(`.${rootDomain}`)) {
    const subdomain = normalized.replace(`.${rootDomain}`, "");

    return prisma.organization.findFirst({
      where: {
        subdomain,
        status: "ACTIVE"
      }
    });
  }

  return prisma.organization.findFirst({
    where: {
      customDomain: normalized,
      status: "ACTIVE"
    }
  });
}

export function getConventionUrl(org: Pick<Organization, "subdomain" | "customDomain">) {
  const rootDomain = getRootDomain();

  if (org.customDomain) {
    return `https://${org.customDomain}`;
  }

  return `https://${org.subdomain}.${rootDomain}`;
}
