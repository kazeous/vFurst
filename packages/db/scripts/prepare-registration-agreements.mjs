import { log } from "node:console";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { createAdminPrismaClient } from "./prisma-admin-client.mjs";

const prisma = createAdminPrismaClient();

export async function prepareRegistrationAgreements(client = prisma) {
  const [schemaState] = await client.$queryRaw`
    SELECT
      to_regclass('public.events')::text AS "eventsTable",
      to_regclass('public.registrations')::text AS "registrationsTable"
  `;

  if (!schemaState?.eventsTable || !schemaState?.registrationsTable) {
    return {
      skipped: true,
      reason: "Event tables do not exist yet; Prisma will create the current schema."
    };
  }

  await client.$executeRaw`
    CREATE UNIQUE INDEX IF NOT EXISTS "events_orgId_id_key" ON "events" ("orgId", "id")
  `;
  await client.$executeRaw`
    CREATE UNIQUE INDEX IF NOT EXISTS "registrations_orgId_eventId_id_key" ON "registrations" ("orgId", "eventId", "id")
  `;

  return { skipped: false };
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  try {
    const result = await prepareRegistrationAgreements();
    log(
      result.skipped
        ? `Registration-agreement preparation skipped: ${result.reason}`
        : "Registration-agreement preparation complete."
    );
  } finally {
    await prisma.$disconnect();
  }
}
