import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@vfurst/db", () => ({ prisma: { organization: { findFirst: mocks.findFirst } } }));

import { clearPortalHostCache, lookupPortalHostOrganization, PORTAL_HOST_CACHE_MAX_ENTRIES, PORTAL_HOST_CACHE_TTL_MS } from "./portal-host-directory";

const org = { id: "org-acme", subdomain: "acme", customDomain: null, customDomainStatus: null };
beforeEach(() => {
  vi.clearAllMocks();
  clearPortalHostCache();
  mocks.findFirst.mockResolvedValue(org);
});

describe("portal host directory", () => {
  it("caches a hit for the TTL and queries again after it expires", async () => {
    expect(PORTAL_HOST_CACHE_TTL_MS).toBe(15_000);
    expect(await lookupPortalHostOrganization("acme", 0)).toEqual(org);
    expect(await lookupPortalHostOrganization("acme", PORTAL_HOST_CACHE_TTL_MS - 1)).toEqual(org);
    expect(mocks.findFirst).toHaveBeenCalledTimes(1);
    await lookupPortalHostOrganization("acme", PORTAL_HOST_CACHE_TTL_MS);
    expect(mocks.findFirst).toHaveBeenCalledTimes(2);
  });

  it("does not cache a miss", async () => {
    mocks.findFirst.mockResolvedValueOnce(null);
    expect(await lookupPortalHostOrganization("acme", 0)).toBeNull();
    expect(await lookupPortalHostOrganization("acme", 1)).toEqual(org);
    expect(mocks.findFirst).toHaveBeenCalledTimes(2);
  });

  it("evicts the oldest entry beyond the size cap", async () => {
    expect(PORTAL_HOST_CACHE_MAX_ENTRIES).toBe(1_000);
    for (let index = 0; index <= PORTAL_HOST_CACHE_MAX_ENTRIES; index++) {
      await lookupPortalHostOrganization(`org-${index}`, 0);
    }
    mocks.findFirst.mockClear();
    await lookupPortalHostOrganization("org-1", 1);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    await lookupPortalHostOrganization("org-0", 1);
    expect(mocks.findFirst).toHaveBeenCalledTimes(1);
  });

  it("looks up custom domains by customDomain and labels by subdomain or slug, active only", async () => {
    await lookupPortalHostOrganization("tickets.acme.test", 0);
    await lookupPortalHostOrganization("acme", 0);
    const select = { id: true, subdomain: true, customDomain: true, customDomainStatus: true };
    expect(mocks.findFirst).toHaveBeenNthCalledWith(1, {
      where: { status: "ACTIVE", customDomain: "tickets.acme.test" }, select
    });
    expect(mocks.findFirst).toHaveBeenNthCalledWith(2, {
      where: { status: "ACTIVE", OR: [{ subdomain: "acme" }, { slug: "acme" }] }, select
    });
  });
});
