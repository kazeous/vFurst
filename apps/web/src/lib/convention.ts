import { prisma } from "@vfurst/db";

export async function getConventionOrg(orgSlug: string) {
  return prisma.organization.findFirst({
    where: {
      OR: [{ subdomain: orgSlug }, { slug: orgSlug }]
    }
  });
}

