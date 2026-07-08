import { prisma } from "@vfurst/db";

export async function getConventionOrg(orgSlug: string) {
  if (!orgSlug || orgSlug.includes(".") || orgSlug.startsWith("_")) {
    return null;
  }

  return prisma.organization.findFirst({
    where: {
      OR: [{ subdomain: orgSlug }, { slug: orgSlug }, { customDomain: orgSlug.toLowerCase() }]
    }
  });
}
