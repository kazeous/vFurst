import { log } from "node:console";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { planAttendeeProfileBackfill } from "./attendee-profile-backfill-plan.mjs";
import { createAdminPrismaClient } from "./prisma-admin-client.mjs";

const prisma = createAdminPrismaClient();

export async function prepareAttendeeProfiles(client = prisma) {
  const [schemaState] = await client.$queryRaw`
    SELECT to_regclass('public.registrations')::text AS "registrationsTable"
  `;
  if (!schemaState?.registrationsTable) {
    return { skipped: true, reason: "Registration tables do not exist yet; Prisma will create the current schema." };
  }

  await client.$executeRaw`
    CREATE TABLE IF NOT EXISTS "attendee_profiles" (
      "id" UUID NOT NULL, "orgId" UUID NOT NULL, "portalAccountId" UUID NOT NULL, "accountHolderOf" UUID,
      "fullName" TEXT NOT NULL, "badgeName" TEXT, "dateOfBirth" DATE, "email" TEXT, "phone" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "attendee_profiles_pkey" PRIMARY KEY ("id"))
  `;
  await client.$executeRaw`
    CREATE UNIQUE INDEX IF NOT EXISTS "attendee_profiles_accountHolderOf_key" ON "attendee_profiles"("accountHolderOf")
  `;
  await client.$executeRaw`
    CREATE UNIQUE INDEX IF NOT EXISTS "attendee_profiles_orgId_id_key" ON "attendee_profiles"("orgId", "id")
  `;
  await client.$executeRaw`
    CREATE UNIQUE INDEX IF NOT EXISTS "attendee_profiles_orgId_portalAccountId_id_key" ON "attendee_profiles"("orgId", "portalAccountId", "id")
  `;
  await client.$executeRaw`
    CREATE INDEX IF NOT EXISTS "attendee_profiles_orgId_idx" ON "attendee_profiles"("orgId")
  `;
  await client.$executeRaw`
    CREATE INDEX IF NOT EXISTS "attendee_profiles_portalAccountId_idx" ON "attendee_profiles"("portalAccountId")
  `;
  await client.$executeRaw`
    ALTER TABLE "registrations" ADD COLUMN IF NOT EXISTS "attendeeProfileId" UUID
  `;

  return client.$transaction(async (tx) => {
    const registrations = await tx.$queryRaw`
      SELECT "id", "portalAccountId", "eventId", "status", "createdAt"
      FROM "registrations" WHERE "attendeeProfileId" IS NULL ORDER BY "createdAt", "id"
    `;
    const accounts = await tx.$queryRaw`
      SELECT "id", "orgId", "name", "email" FROM "portal_accounts"
      WHERE "id" IN (SELECT "portalAccountId" FROM "registrations" WHERE "attendeeProfileId" IS NULL)
      ORDER BY "id"
    `;
    const existingSelfProfiles = await tx.$queryRaw`
      SELECT "id", "portalAccountId" FROM "attendee_profiles" WHERE "accountHolderOf" IS NOT NULL
    `;
    const { profiles, assignments } = planAttendeeProfileBackfill({ accounts, registrations, existingSelfProfiles, newId: randomUUID });
    for (const profile of profiles) {
      await tx.$executeRaw`
        INSERT INTO "attendee_profiles" ("id", "orgId", "portalAccountId", "accountHolderOf", "fullName", "createdAt", "updatedAt")
        VALUES (${profile.id}::uuid, ${profile.orgId}::uuid, ${profile.portalAccountId}::uuid,
          ${profile.accountHolderOf}::uuid, ${profile.fullName}, NOW(), NOW())
      `;
    }
    for (const assignment of assignments) {
      await tx.$executeRaw`
        UPDATE "registrations" SET "attendeeProfileId" = ${assignment.attendeeProfileId}::uuid
        WHERE "id" = ${assignment.registrationId}::uuid AND "attendeeProfileId" IS NULL
      `;
    }
    return { skipped: false, profilesCreated: profiles.length, registrationsAssigned: assignments.length };
  });
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  try {
    const result = await prepareAttendeeProfiles();
    log(result.skipped
      ? `Attendee-profile preparation skipped: ${result.reason}`
      : `Attendee-profile preparation complete: ${result.profilesCreated} profiles created, ${result.registrationsAssigned} registrations assigned.`);
  } finally {
    await prisma.$disconnect();
  }
}
