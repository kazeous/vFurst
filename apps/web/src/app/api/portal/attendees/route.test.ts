import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  org: vi.fn(), account: vi.fn(), event: vi.fn(), self: vi.fn(), profiles: vi.fn(), registrations: vi.fn()
}));
vi.mock("@/lib/portal-request", () => ({ getCachedRequestPortalOrg: mocks.org }));
vi.mock("@/lib/portal-account", () => ({ getPortalAccount: mocks.account }));
vi.mock("@vfurst/db", () => ({ prisma: {
  event: { findFirst: mocks.event },
  attendeeProfile: { findUnique: mocks.self, findMany: mocks.profiles },
  registration: { findMany: mocks.registrations }
} }));

import { GET } from "./route";

const org = { id: "org-one" };
const account = { id: "account-one", orgId: org.id, name: "Owner", email: "owner@example.com" };
const eventId = "00000000-0000-4000-8000-000000000001";
const event = { id: eventId, orgId: org.id, settings: { maxRegistrationsPerUser: 4 } };
const self = {
  id: "profile-self", orgId: org.id, portalAccountId: account.id, accountHolderOf: account.id,
  fullName: "Owner", badgeName: null, dateOfBirth: new Date("1990-01-01"), email: "private@example.com", phone: "123456789"
};
const child = { ...self, id: "profile-child", accountHolderOf: null, fullName: "Child", badgeName: "Sam" };
const request = (id = eventId) => new NextRequest(`https://acme.example.com/api/portal/attendees?eventId=${id}`);

async function expectPrivate(response: Response, status: number, body: unknown) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual(body);
  expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
}

describe("private portal attendees", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.org.mockResolvedValue(org);
    mocks.account.mockResolvedValue(account);
    mocks.event.mockResolvedValue(event);
    mocks.self.mockResolvedValue(self);
    mocks.profiles.mockResolvedValue([child, self]);
    mocks.registrations.mockResolvedValue([{ attendeeProfileId: child.id }]);
  });

  it("returns 404 off a portal host", async () => {
    mocks.org.mockResolvedValue(null);
    await expectPrivate(await GET(request()), 404, { account: null, attendees: null });
    expect(mocks.account).not.toHaveBeenCalled();
    expect(mocks.event).not.toHaveBeenCalled();
  });

  it("returns 401 without an account for the request organization", async () => {
    mocks.account.mockResolvedValue(null);
    await expectPrivate(await GET(request()), 401, { account: null, attendees: null });
    expect(mocks.account).toHaveBeenCalledWith(org);
    expect(mocks.profiles).not.toHaveBeenCalled();
    expect(mocks.registrations).not.toHaveBeenCalled();
  });

  it("starts the event lookup before the session resolves", async () => {
    let resolveAccount!: (value: typeof account) => void;
    mocks.account.mockReturnValue(new Promise<typeof account>((resolve) => {
      resolveAccount = resolve;
    }));
    const response = GET(request());
    try {
      await vi.waitFor(() => expect(mocks.event).toHaveBeenCalledTimes(1));
    } finally {
      resolveAccount(account);
    }
    await expectPrivate(await response, 200, {
      account: { email: "owner@example.com", name: "Owner" },
      cap: 4, used: 1, attendees: [
        { id: self.id, fullName: "Owner", badgeName: null, isAccountHolder: true, registered: false },
        { id: child.id, fullName: "Child", badgeName: "Sam", isAccountHolder: false, registered: true }
      ]
    });
  });

  it.each(["unknown", "unpublished", "foreign"])("returns 404 for an %s event", async () => {
    mocks.event.mockResolvedValue(null);
    await expectPrivate(await GET(request()), 404, { account: { email: "owner@example.com", name: "Owner" }, attendees: null });
    expect(mocks.event).toHaveBeenCalledWith(expect.objectContaining({ where: { id: eventId, orgId: org.id, status: "PUBLISHED" } }));
    expect(mocks.profiles).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing or invalid event id", async () => {
    await expectPrivate(await GET(request("invalid")), 404, { account: { email: "owner@example.com", name: "Owner" }, attendees: null });
    await expectPrivate(await GET(new NextRequest("https://acme.example.com/api/portal/attendees")), 404, { account: { email: "owner@example.com", name: "Owner" }, attendees: null });
    expect(mocks.event).not.toHaveBeenCalled();
  });

  it("lists profiles without date of birth, contact email or phone", async () => {
    await expectPrivate(await GET(request()), 200, {
      account: { email: "owner@example.com", name: "Owner" },
      cap: 4, used: 1, attendees: [
        { id: self.id, fullName: "Owner", badgeName: null, isAccountHolder: true, registered: false },
        { id: child.id, fullName: "Child", badgeName: "Sam", isAccountHolder: false, registered: true }
      ]
    });
    expect(mocks.profiles).toHaveBeenCalledWith(expect.objectContaining({ where: { orgId: org.id, portalAccountId: account.id } }));
    expect(mocks.self).not.toHaveBeenCalled();
    expect(mocks.registrations).toHaveBeenCalledWith(expect.objectContaining({ where: {
      orgId: org.id, portalAccountId: account.id, eventId, status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] }
    } }));
  });

  it("never returns the account's id or org id", async () => {
    const body = await (await GET(request())).json();
    expect(Object.keys(body.account).sort()).toEqual(["email", "name"]);
  });

  it("sends private no-store headers on a successful empty registration list", async () => {
    mocks.registrations.mockResolvedValue([]);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
