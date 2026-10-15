import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@vfurst/db";
import { assertRaffleEligibility, parseRaffleEligibility, parseRafflePrizes, weightedWinner } from "./raffle-policy";

describe("raffle contract", () => {
  it("checks raffle eligibility and the entry limit by portal account", async () => {
    const tx = {
      raffle: { findUnique: vi.fn().mockResolvedValue({ id: "r1", orgId: "o1", eventId: "e1", eligibility: { kind: "CONFIRMED_REGISTRATION" }, maxEntriesPerUser: 1 }) },
      registration: { findFirst: vi.fn().mockResolvedValue({ id: "reg1" }) },
      raffleEntry: { aggregate: vi.fn().mockResolvedValue({ _sum: { quantity: 0 } }) }
    };

    await assertRaffleEligibility(tx as unknown as Prisma.TransactionClient, {
      raffleId: "r1", orgId: "o1", eventId: "e1", portalAccountId: "acct-1", entryMethod: "MANUAL"
    });

    const where = tx.registration.findFirst.mock.calls[0]![0].where;
    expect(where).toHaveProperty("portalAccountId", "acct-1");
    expect(where).not.toHaveProperty("userId");
    expect(tx.raffleEntry.aggregate).toHaveBeenCalledWith({
      where: { raffleId: "r1", portalAccountId: "acct-1" }, _sum: { quantity: true }
    });
  });

  it("accepts the supported eligibility rules and rejects malformed resources", () => {
    expect(parseRaffleEligibility({ kind: "CONFIRMED_REGISTRATION" })).toEqual({ kind: "CONFIRMED_REGISTRATION" });
    expect(parseRaffleEligibility({ kind: "PURCHASED", productId: "11111111-1111-4111-8111-111111111111", entriesPerUnit: 2 })).toEqual({
      kind: "PURCHASED",
      productId: "11111111-1111-4111-8111-111111111111",
      entriesPerUnit: 2
    });
    expect(() => parseRaffleEligibility({ kind: "PURCHASED", productId: "not-a-uuid" })).toThrow(/eligibility/i);
  });

  it("validates prize names and quantities", () => {
    expect(parseRafflePrizes([{ name: "VIP", quantity: 2 }])).toEqual([{ name: "VIP", quantity: 2 }]);
    expect(() => parseRafflePrizes([{ name: "VIP", quantity: 1 }, { name: "vip", quantity: 1 }])).toThrow(/unique/i);
    expect(() => parseRafflePrizes([{ name: "VIP", quantity: 0 }])).toThrow(/prize/i);
  });

  it("weights purchased quantities while still returning a single candidate", () => {
    const previousRandom = Math.random;
    try {
      Math.random = () => 0.99;
      expect(weightedWinner([{ id: "one", quantity: 1 }, { id: "two", quantity: 4 }])?.id).toBe("two");
      Math.random = () => 0;
      expect(weightedWinner([{ id: "one", quantity: 1 }, { id: "two", quantity: 4 }])?.id).toBe("one");
    } finally {
      Math.random = previousRandom;
    }
  });
});
