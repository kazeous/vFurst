import { describe, expect, it, vi } from "vitest";
import { backfillPaymentAttemptLocks } from "./backfill-payment-attempt-locks.mjs";

describe("payment-attempt lock backfill", () => {
  it("expires stale attempts, cancels duplicate locks, and claims one active lock per order", async () => {
    const statements = [];
    const client = {
      $executeRaw: vi.fn(async (strings) => {
        statements.push(strings.join("?"));
        return statements.length;
      })
    };

    await expect(backfillPaymentAttemptLocks(client)).resolves.toEqual({
      expiredAttempts: 1,
      cancelledDuplicates: 2,
      claimedAttempts: 3
    });
    expect(statements[0]).toContain('"expiresAt" <= NOW()');
    expect(statements[1]).toContain("ROW_NUMBER() OVER");
    expect(statements[1]).toContain("lock_rank > 1");
    expect(statements[2]).toContain('SET "activeOrderId" = "orderId"');
  });
});
