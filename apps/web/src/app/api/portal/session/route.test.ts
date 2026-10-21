import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCachedRequestPortalOrg: vi.fn(),
  getPortalAccount: vi.fn()
}));

vi.mock("@/lib/portal-request", () => ({ getCachedRequestPortalOrg: mocks.getCachedRequestPortalOrg }));
vi.mock("@/lib/portal-account", () => ({ getPortalAccount: mocks.getPortalAccount }));

import { GET } from "./route";

function expectPrivateHeaders(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
}

describe("portal session endpoint", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 404 with a null account off a portal host", async () => {
    mocks.getCachedRequestPortalOrg.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ account: null });
    expectPrivateHeaders(response);
    expect(mocks.getPortalAccount).not.toHaveBeenCalled();
  });

  it("returns a null account with private no-store headers when signed out", async () => {
    const org = { id: "org-acme", slug: "acme" };
    mocks.getCachedRequestPortalOrg.mockResolvedValue(org);
    mocks.getPortalAccount.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ account: null });
    expectPrivateHeaders(response);
    expect(mocks.getPortalAccount).toHaveBeenCalledExactlyOnceWith(org);
  });

  it("returns only the email and name of the signed-in account", async () => {
    const org = { id: "org-acme", slug: "acme" };
    mocks.getCachedRequestPortalOrg.mockResolvedValue(org);
    mocks.getPortalAccount.mockResolvedValue({
      id: "account-private",
      orgId: org.id,
      email: "attendee@example.com",
      name: "Attendee"
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ account: { email: "attendee@example.com", name: "Attendee" } });
    expectPrivateHeaders(response);
    expect(mocks.getPortalAccount).toHaveBeenCalledExactlyOnceWith(org);
  });
});
