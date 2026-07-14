import { describe, expect, it, vi } from "vitest";
import { backfillManagedTenancy } from "./backfill-managed-tenancy.mjs";

describe("managed-tenancy backfill", () => {
  it("activates only unmarked legacy rows and preserves only unclassified routed domains", async () => {
    const statements = [];
    const client = {
      $executeRaw: vi.fn(async (strings) => {
        statements.push(strings.join("?"));
        return statements.length === 1 ? 4 : 2;
      })
    };

    await expect(backfillManagedTenancy(client)).resolves.toEqual({
      activatedOrganizations: 4,
      preservedCustomDomains: 2
    });
    expect(statements[0]).toContain('"status" = \'PROVISIONING\'');
    expect(statements[0]).toContain('"statusUpdatedAt" IS NULL');
    expect(statements[1]).toContain('"customDomain" IS NOT NULL');
    expect(statements[1]).toContain('"customDomainStatus" IS NULL');
  });
});
