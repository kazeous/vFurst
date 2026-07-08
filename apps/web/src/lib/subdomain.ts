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

    return prisma.organization.findUnique({
      where: {
        subdomain
      }
    });
  }

  return prisma.organization.findUnique({
    where: {
      customDomain: normalized
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
