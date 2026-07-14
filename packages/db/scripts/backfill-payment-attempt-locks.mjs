import { PrismaClient } from "@prisma/client";
import { log } from "node:console";
import process from "node:process";
import { pathToFileURL } from "node:url";

const prisma = new PrismaClient();

export async function backfillPaymentAttemptLocks(client = prisma) {
  const expiredAttempts = await client.$executeRaw`
    UPDATE "payment_attempts"
    SET
      "status" = 'EXPIRED'::"PaymentAttemptStatus",
      "activeOrderId" = NULL
    WHERE
      "status" = 'PENDING'::"PaymentAttemptStatus"
      AND "expiresAt" <= NOW()
  `;

  const cancelledDuplicates = await client.$executeRaw`
    WITH ranked_attempts AS (
      SELECT
        attempt."id",
        ROW_NUMBER() OVER (
          PARTITION BY attempt."orderId"
          ORDER BY
            CASE WHEN attempt."status" = 'REVIEW'::"PaymentAttemptStatus" THEN 0 ELSE 1 END,
            CASE
              WHEN orders."paymentReference" IS NOT NULL
                AND orders."paymentReference" IN (attempt."providerReference", attempt."paymentCode")
              THEN 0 ELSE 1
            END,
            attempt."createdAt" DESC,
            attempt."id" DESC
        ) AS lock_rank
      FROM "payment_attempts" AS attempt
      INNER JOIN "orders" AS orders ON orders."id" = attempt."orderId"
      WHERE attempt."status" IN (
        'PENDING'::"PaymentAttemptStatus",
        'REVIEW'::"PaymentAttemptStatus"
      )
    )
    UPDATE "payment_attempts" AS attempt
    SET
      "status" = 'CANCELLED'::"PaymentAttemptStatus",
      "activeOrderId" = NULL
    FROM ranked_attempts
    WHERE
      attempt."id" = ranked_attempts."id"
      AND ranked_attempts.lock_rank > 1
  `;

  const claimedAttempts = await client.$executeRaw`
    UPDATE "payment_attempts"
    SET "activeOrderId" = "orderId"
    WHERE "status" IN (
      'PENDING'::"PaymentAttemptStatus",
      'REVIEW'::"PaymentAttemptStatus"
    )
      AND "activeOrderId" IS DISTINCT FROM "orderId"
  `;

  return {
    expiredAttempts,
    cancelledDuplicates,
    claimedAttempts
  };
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  try {
    const result = await backfillPaymentAttemptLocks();
    log(
      `Payment-attempt lock backfill complete: ${result.expiredAttempts} expired, ${result.cancelledDuplicates} duplicate(s) cancelled, ${result.claimedAttempts} active lock(s) claimed.`
    );
  } finally {
    await prisma.$disconnect();
  }
}
