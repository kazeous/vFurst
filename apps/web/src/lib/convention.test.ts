import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma, type Organization } from "@vfurst/db";
import { getConventionOrg } from "./convention";

vi.mock("@vfurst/db", () => ({ prisma: { organization: { findFirst: vi.fn() } } }));

describe("getConventionOrg", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each(["sample-convention", "sample-con"])("looks up active slug or subdomain %s after normalization", async (slug) => {
    const org = { id: "org-1" } as Organization;
    vi.mocked(prisma.organization.findFirst).mockResolvedValue(org);

    expect(await getConventionOrg(`  ${slug.toUpperCase()}  `)).toBe(org);
    expect(prisma.organization.findFirst).toHaveBeenCalledExactlyOnceWith({
      where: { status: "ACTIVE", OR: [{ subdomain: slug }, { slug }] }
    });
  });

  it("looks up only an active custom domain after normalization", async () => {
    const org = { id: "org-domain" } as Organization;
    vi.mocked(prisma.organization.findFirst).mockResolvedValue(org);

    expect(await getConventionOrg("  Events.Example.com  ")).toBe(org);
    expect(prisma.organization.findFirst).toHaveBeenCalledExactlyOnceWith({
      where: { status: "ACTIVE", customDomain: "events.example.com" }
    });
  });

  it.each(["", "   ", "_next", "  _PRIVATE  "])("rejects invalid input %j without querying", async (slug) => {
    expect(await getConventionOrg(slug)).toBeNull();
    expect(prisma.organization.findFirst).not.toHaveBeenCalled();
  });

  it("returns null when no active organization matches", async () => {
    vi.mocked(prisma.organization.findFirst).mockResolvedValue(null);

    expect(await getConventionOrg("missing")).toBeNull();
  });
});
