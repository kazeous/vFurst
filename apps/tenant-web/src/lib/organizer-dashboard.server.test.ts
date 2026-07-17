import { createHostPolicy } from "@vfurst/tenant-context";
import { describe, expect, it, vi } from "vitest";
import {
  decideOrganizerDashboardAuth,
  decideOrganizerDashboardHost,
  loadOrganizerWorkspace,
  projectOrganizerMemberships,
  type OrganizerMembershipRecord
} from "./organizer-dashboard.server.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const policy = createHostPolicy({
  rootDomain: "vfurst.example",
  managerHostname: "manager.vfurst.example",
  consoleHostname: "console.vfurst.example",
  apiHostname: "api.vfurst.example",
  reservedSubdomains: ["www"]
});

const records: readonly OrganizerMembershipRecord[] = [
  {
    role: "OWNER",
    org: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Alpha Conventions",
      slug: "alpha",
      status: "ACTIVE",
      events: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          name: "Alpha 2027",
          slug: "alpha-2027",
          status: "DRAFT",
          startDate: new Date("2027-05-01T00:00:00.000Z"),
          endDate: new Date("2027-05-03T00:00:00.000Z")
        }
      ]
    }
  },
  {
    role: "MEMBER",
    org: {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      name: "Attendee Only",
      slug: "attendee-only",
      status: "ACTIVE",
      events: [
        {
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          name: "Private Event",
          slug: "private-event",
          status: "PUBLISHED",
          startDate: new Date("2027-06-01T00:00:00.000Z"),
          endDate: new Date("2027-06-02T00:00:00.000Z")
        }
      ]
    }
  }
];

describe("organizer dashboard authority", () => {
  it("allows only the canonical console host", () => {
    expect(decideOrganizerDashboardHost("console.vfurst.example", policy)).toMatchObject({ kind: "allow" });
    expect(decideOrganizerDashboardHost("api.vfurst.example", policy)).toMatchObject({
      kind: "reject",
      reason: "api"
    });
    expect(decideOrganizerDashboardHost("alpha.vfurst.example", policy)).toMatchObject({
      kind: "reject",
      reason: "tenant"
    });
    expect(decideOrganizerDashboardHost("events.customer.example", policy)).toMatchObject({
      kind: "reject",
      reason: "tenant"
    });
  });

  it("redirects missing identity through the tenant auth handoff with a safe local return", () => {
    expect(decideOrganizerDashboardAuth(null, "/dashboard")).toEqual({
      kind: "redirect",
      location: "/auth/start?returnTo=%2Fdashboard"
    });
    expect(decideOrganizerDashboardAuth(null, "//attacker.example/path")).toEqual({
      kind: "redirect",
      location: "/auth/start?returnTo=%2Fdashboard"
    });

    const identity = {
      identitySessionId: "22222222-2222-4222-8222-222222222222",
      userId: USER_ID,
      authVersion: 3,
      expiresAt: new Date("2027-01-01T00:00:00.000Z")
    };
    expect(decideOrganizerDashboardAuth(identity)).toEqual({ kind: "allow", identity });
  });

  it("projects only OWNER and ADMIN memberships and their own events", () => {
    const workspace = projectOrganizerMemberships(records);
    expect(workspace.isEmpty).toBe(false);
    expect(workspace.eventCount).toBe(1);
    expect(workspace.organizations).toEqual([
      expect.objectContaining({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        role: "OWNER",
        events: [expect.objectContaining({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" })]
      })
    ]);
    expect(JSON.stringify(workspace)).not.toContain("Attendee Only");
    expect(JSON.stringify(workspace)).not.toContain("Private Event");
  });

  it("keeps platform role out of authority and returns an empty organizer state", () => {
    const memberOnly = projectOrganizerMemberships([records[1]!]);
    expect(memberOnly).toEqual({ organizations: [], eventCount: 0, isEmpty: true });
    expect(projectOrganizerMemberships([])).toEqual({ organizations: [], eventCount: 0, isEmpty: true });
  });

  it("derives the database query solely from the fresh identity user id", async () => {
    const findMembershipsForUser = vi.fn(async () => records);
    const workspace = await loadOrganizerWorkspace(USER_ID, { findMembershipsForUser });

    expect(findMembershipsForUser).toHaveBeenCalledOnce();
    expect(findMembershipsForUser).toHaveBeenCalledWith(USER_ID);
    expect(workspace.organizations).toHaveLength(1);
  });
});
