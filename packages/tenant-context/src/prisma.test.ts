import type { PrismaClient } from "@vfurst/db";
import { describe, expect, it, vi } from "vitest";
import { createPrismaTenantDirectory } from "./prisma.js";

const databaseRecord = {
  id: "3e8cb9e3-192b-4b61-9b86-890b2e599ab6",
  slug: "sample-organization",
  subdomain: "sample-con",
  customDomain: "events.customer.example",
  status: "ACTIVE" as const
};

function clientReturning(record: typeof databaseRecord | null) {
  const findUnique = vi.fn(async (args: unknown) => {
    void args;
    return record;
  });
  return {
    client: { organization: { findUnique } } as unknown as Pick<PrismaClient, "organization">,
    findUnique
  };
}

describe("createPrismaTenantDirectory", () => {
  it("uses the unique managed subdomain and selects only routing projection fields", async () => {
    const { client, findUnique } = clientReturning(databaseRecord);
    const record = await createPrismaTenantDirectory(client).findByManagedSubdomain("sample-con");

    expect(findUnique).toHaveBeenCalledWith({
      where: { subdomain: "sample-con" },
      select: { id: true, slug: true, subdomain: true, customDomain: true, status: true }
    });
    expect(record).toEqual({
      organizationId: databaseRecord.id,
      slug: databaseRecord.slug,
      subdomain: databaseRecord.subdomain,
      customDomain: databaseRecord.customDomain,
      status: databaseRecord.status
    });
    expect(Object.isFrozen(record)).toBe(true);
  });

  it("queries the assigned customDomain without filtering on replacement request status", async () => {
    const { client, findUnique } = clientReturning(databaseRecord);
    await createPrismaTenantDirectory(client).findByCustomDomain("events.customer.example");

    expect(findUnique).toHaveBeenCalledWith({
      where: { customDomain: "events.customer.example" },
      select: { id: true, slug: true, subdomain: true, customDomain: true, status: true }
    });
    const query = findUnique.mock.calls[0]?.[0];
    expect(query).not.toHaveProperty("where.customDomainStatus");
    expect(query).not.toHaveProperty("select.customDomainStatus");
    expect(query).not.toHaveProperty("select.requestedCustomDomain");
  });

  it("returns null when no routing assignment exists", async () => {
    const { client } = clientReturning(null);
    await expect(createPrismaTenantDirectory(client).findByCustomDomain("missing.example")).resolves.toBeNull();
  });
});
