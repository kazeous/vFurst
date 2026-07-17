import { prisma, type Prisma, type PrismaClient } from "@vfurst/db";
import type { TenantDirectory, TenantDirectoryRecord } from "./types.js";

const tenantDirectorySelect = {
  id: true,
  slug: true,
  subdomain: true,
  customDomain: true,
  status: true
} satisfies Prisma.OrganizationSelect;

function toDirectoryRecord(record: {
  id: string;
  slug: string;
  subdomain: string;
  customDomain: string | null;
  status: TenantDirectoryRecord["status"];
}): TenantDirectoryRecord {
  return Object.freeze({
    organizationId: record.id,
    slug: record.slug,
    subdomain: record.subdomain,
    customDomain: record.customDomain,
    status: record.status
  });
}

export function createPrismaTenantDirectory(
  client: Pick<PrismaClient, "organization"> = prisma
): TenantDirectory {
  return {
    async findByManagedSubdomain(subdomain) {
      const record = await client.organization.findUnique({
        where: { subdomain },
        select: tenantDirectorySelect
      });
      return record ? toDirectoryRecord(record) : null;
    },

    async findByCustomDomain(hostname) {
      // `customDomain` is the currently assigned route. Do not filter on
      // customDomainStatus: that status may describe a pending replacement
      // while this assigned domain must continue routing.
      const record = await client.organization.findUnique({
        where: { customDomain: hostname },
        select: tenantDirectorySelect
      });
      return record ? toDirectoryRecord(record) : null;
    }
  };
}

export const prismaTenantDirectory = createPrismaTenantDirectory();
