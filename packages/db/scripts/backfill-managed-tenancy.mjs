import { log } from "node:console";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { createAdminPrismaClient } from "./prisma-admin-client.mjs";

const prisma = createAdminPrismaClient();

export async function backfillManagedTenancy(client = prisma) {
  const activatedOrganizations = await client.$executeRaw`
    UPDATE "organizations"
    SET
      "status" = 'ACTIVE'::"OrganizationStatus",
      "statusUpdatedAt" = COALESCE("updatedAt", "createdAt", NOW())
    WHERE
      "status" = 'PROVISIONING'::"OrganizationStatus"
      AND "statusUpdatedAt" IS NULL
  `;

  const preservedCustomDomains = await client.$executeRaw`
    UPDATE "organizations"
    SET
      "requestedCustomDomain" = "customDomain",
      "customDomainStatus" = 'ACTIVE'::"CustomDomainStatus",
      "customDomainVerifiedAt" = COALESCE("customDomainVerifiedAt", "updatedAt", "createdAt", NOW()),
      "customDomainActivatedAt" = COALESCE("customDomainActivatedAt", "updatedAt", "createdAt", NOW())
    WHERE
      "customDomain" IS NOT NULL
      AND "customDomainStatus" IS NULL
  `;

  return {
    activatedOrganizations,
    preservedCustomDomains
  };
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  try {
    const result = await backfillManagedTenancy();
    log(
      `Managed-tenancy backfill complete: ${result.activatedOrganizations} existing organization(s) activated, ${result.preservedCustomDomains} custom domain(s) preserved.`
    );
  } finally {
    await prisma.$disconnect();
  }
}
