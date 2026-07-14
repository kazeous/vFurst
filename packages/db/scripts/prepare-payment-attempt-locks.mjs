import { PrismaClient } from "@prisma/client";
import { log } from "node:console";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { backfillPaymentAttemptLocks } from "./backfill-payment-attempt-locks.mjs";

const prisma = new PrismaClient();

export async function preparePaymentAttemptLocks(client = prisma) {
  const [schemaState] = await client.$queryRaw`
    SELECT
      to_regclass('public.payment_attempts')::text AS "paymentAttemptsTable",
      to_regclass('public.payment_exceptions')::text AS "paymentExceptionsTable"
  `;

  if (!schemaState?.paymentAttemptsTable || !schemaState?.paymentExceptionsTable) {
    return {
      skipped: true,
      reason: "Payment tables do not exist yet; Prisma will create the current schema."
    };
  }

  await client.$executeRaw`
    ALTER TABLE "payment_attempts"
    ADD COLUMN IF NOT EXISTS "activeOrderId" UUID
  `;
  await client.$executeRaw`
    ALTER TABLE "payment_exceptions"
    ADD COLUMN IF NOT EXISTS "providerReference" TEXT
  `;
  await client.$executeRaw`
    ALTER TYPE "PaymentExceptionType"
    ADD VALUE IF NOT EXISTS 'STALE_ATTEMPT'
  `;

  const backfill = await backfillPaymentAttemptLocks(client);

  await client.$executeRaw`
    CREATE UNIQUE INDEX IF NOT EXISTS "payment_attempts_activeOrderId_key"
    ON "payment_attempts" ("activeOrderId")
  `;
  await client.$executeRaw`
    CREATE UNIQUE INDEX IF NOT EXISTS "payment_exceptions_providerReference_key"
    ON "payment_exceptions" ("providerReference")
  `;

  return {
    skipped: false,
    ...backfill
  };
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  try {
    const result = await preparePaymentAttemptLocks();
    log(
      result.skipped
        ? `Payment-attempt lock preparation skipped: ${result.reason}`
        : `Payment-attempt lock preparation complete: ${result.expiredAttempts} expired, ${result.cancelledDuplicates} duplicate(s) cancelled, ${result.claimedAttempts} active lock(s) claimed.`
    );
  } finally {
    await prisma.$disconnect();
  }
}
