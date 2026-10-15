import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestPortalOrg: vi.fn(),
  getPortalAccount: vi.fn(),
  findFirst: vi.fn()
}));

vi.mock("@/lib/portal-request", () => ({ getRequestPortalOrg: mocks.getRequestPortalOrg }));
vi.mock("@/lib/portal-account", () => ({ getPortalAccount: mocks.getPortalAccount }));
vi.mock("@vfurst/db", () => ({ prisma: { registration: { findFirst: mocks.findFirst } } }));

import { GET } from "./route";

const org = { id: "org-acme", slug: "acme" };
const account = { id: "account-owner", orgId: org.id, email: "owner@example.com", name: "Owner" };
const registrationId = "123e4567-e89b-42d3-a456-426614174000";
const request = () => new NextRequest(`https://acme.example.com/api/public/registration-confirmation?registrationId=${registrationId}`);

async function expectResponse(response: Response, status: number, body: unknown) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual(body);
  expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
}

describe("registration confirmation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getRequestPortalOrg.mockResolvedValue(org);
    mocks.getPortalAccount.mockResolvedValue(account);
  });

  it("returns 404 off a portal host", async () => {
    mocks.getRequestPortalOrg.mockResolvedValue(null);
    await expectResponse(await GET(request()), 404, { confirmed: false });
    expect(mocks.getRequestPortalOrg).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.getPortalAccount).not.toHaveBeenCalled();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when signed out", async () => {
    mocks.getPortalAccount.mockResolvedValue(null);
    await expectResponse(await GET(request()), 404, { confirmed: false });
    expect(mocks.getPortalAccount).toHaveBeenCalledExactlyOnceWith(org);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("returns 404 for a registration owned by another account", async () => {
    mocks.findFirst.mockResolvedValue(null);
    await expectResponse(await GET(request()), 404, { confirmed: false });
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: registrationId, orgId: org.id, portalAccountId: account.id }
    }));
  });

  it("returns the confirmation for the signed-in owner", async () => {
    mocks.findFirst.mockResolvedValue({
      approvalStatus: "APPROVED",
      event: { name: "Convention" },
      type: { name: "Weekend" },
      portalAccount: { name: account.name, email: account.email }
    });
    await expectResponse(await GET(request()), 200, {
      attendee: "Owner", approvalStatus: "APPROVED", confirmed: true, event: "Convention", tier: "Weekend"
    });
    expect(mocks.getPortalAccount).toHaveBeenCalledExactlyOnceWith(org);
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: registrationId, orgId: org.id, portalAccountId: account.id }
    }));
  });
});
