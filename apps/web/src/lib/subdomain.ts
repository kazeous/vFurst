import { prisma, type Organization } from "@vfurst/db";
import { buildTenantUrl, resolveActiveTenantContext } from "@vfurst/tenant-context";
import { prismaTenantDirectory } from "@vfurst/tenant-context/prisma";
import { getTenantHostPolicy } from "./tenant-host-policy";

export async function resolveOrganization(hostname: string) {
  try {
    const context = await resolveActiveTenantContext(hostname, getTenantHostPolicy(), prismaTenantDirectory);
    return prisma.organization.findUnique({ where: { id: context.organizationId } });
  } catch {
    return null;
  }
}

export function getConventionUrl(org: Pick<Organization, "subdomain" | "customDomain">) {
  return buildTenantUrl(org, getTenantHostPolicy());
}
