import { describe, expect, it, vi } from "vitest";
import { preparePaymentAttemptLocks } from "./prepare-payment-attempt-locks.mjs";

describe("payment-attempt lock schema preparation", () => {
  it("skips safely before a greenfield database has payment tables", async () => {
    const client = {
      $queryRaw: vi.fn(async () => [{ paymentAttemptsTable: null, paymentExceptionsTable: null }]),
      $executeRaw: vi.fn()
    };

    await expect(preparePaymentAttemptLocks(client)).resolves.toEqual({
      skipped: true,
      reason: "Payment tables do not exist yet; Prisma will create the current schema."
    });
    expect(client.$executeRaw).not.toHaveBeenCalled();
  });

  it("prepares legacy columns, backfills rows, and creates unique indexes before Prisma sync", async () => {
    const statements = [];
    const client = {
      $queryRaw: vi.fn(async () => [
        { paymentAttemptsTable: "payment_attempts", paymentExceptionsTable: "payment_exceptions" }
      ]),
      $executeRaw: vi.fn(async (strings) => {
        statements.push(strings.join("?"));
        return 0;
      })
    };

    await expect(preparePaymentAttemptLocks(client)).resolves.toEqual({
      skipped: false,
      expiredAttempts: 0,
      cancelledDuplicates: 0,
      claimedAttempts: 0
    });
    expect(statements).toHaveLength(8);
    expect(statements[0]).toContain('ADD COLUMN IF NOT EXISTS "activeOrderId"');
    expect(statements[1]).toContain('ADD COLUMN IF NOT EXISTS "providerReference"');
    expect(statements[2]).toContain("ADD VALUE IF NOT EXISTS 'STALE_ATTEMPT'");
    expect(statements[6]).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "payment_attempts_activeOrderId_key"');
    expect(statements[7]).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "payment_exceptions_providerReference_key"');
  });
});
