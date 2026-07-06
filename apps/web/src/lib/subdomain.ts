import { prisma, type Organization } from "@vfurst/db";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "vfurst.app";

export function normalizeHostname(hostname: string) {
  return hostname.split(":")[0]?.toLowerCase() ?? "";
}

export async function resolveOrganization(hostname: string) {
  const normalized = normalizeHostname(hostname);

  if (!normalized || normalized === ROOT_DOMAIN || normalized === `app.${ROOT_DOMAIN}` || normalized === "localhost") {
    return null;
  }

  if (normalized.endsWith(`.${ROOT_DOMAIN}`)) {
    const subdomain = normalized.replace(`.${ROOT_DOMAIN}`, "");

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
  if (org.customDomain) {
    return `https://${org.customDomain}`;
  }

  return `https://${org.subdomain}.${ROOT_DOMAIN}`;
}

