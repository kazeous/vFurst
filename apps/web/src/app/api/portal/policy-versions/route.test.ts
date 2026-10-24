import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ org: vi.fn(), versions: vi.fn() }));
vi.mock("@/lib/portal-request", () => ({ getCachedRequestPortalOrg: mocks.org }));
vi.mock("@vfurst/db", () => ({ prisma: { policyDocumentVersion: { findMany: mocks.versions } } }));

import { GET } from "./route";

const org = { id: "org-one" };
const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";
const request = (ids: string | null) => new NextRequest(
  `https://acme.example.com/api/portal/policy-versions${ids === null ? "" : `?ids=${encodeURIComponent(ids)}`}`
);

describe("portal policy versions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.org.mockResolvedValue(org);
    mocks.versions.mockResolvedValue([
      { id: first, title: "Code of Conduct", body: "# Be kind" },
      { id: second, title: "Refund Policy", body: "No refunds." }
    ]);
  });

  it("returns the requested published versions of this organization as immutable", async () => {
    const response = await GET(request(`${first},${second},${first}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ versions: [
      { id: first, title: "Code of Conduct", body: "# Be kind" },
      { id: second, title: "Refund Policy", body: "No refunds." }
    ] });
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(mocks.versions).toHaveBeenCalledWith({
      where: { id: { in: [first, second] }, orgId: org.id, document: { orgId: org.id, event: { orgId: org.id, status: "PUBLISHED" } } },
      select: { id: true, title: true, body: true }
    });
  });

  it.each([
    ["off a portal host", `${first}`, null],
    ["without ids", null, org],
    ["with a malformed id", "not-a-uuid", org]
  ])("returns an uncached 404 %s", async (_case, ids, requestOrg) => {
    mocks.org.mockResolvedValue(requestOrg);
    const response = await GET(request(ids));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ versions: null });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.versions).not.toHaveBeenCalled();
  });

  it("returns an uncached 404 when any version is foreign, unpublished or missing", async () => {
    mocks.versions.mockResolvedValue([{ id: first, title: "Code of Conduct", body: "# Be kind" }]);
    const response = await GET(request(`${first},${second}`));
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
