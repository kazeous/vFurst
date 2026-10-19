import { prisma } from "@vfurst/db";

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
