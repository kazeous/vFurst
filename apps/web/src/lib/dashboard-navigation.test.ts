import { describe, expect, it } from "vitest";
import {
  getDashboardEventId,
  getDashboardOrganizationId,
  isDashboardResourceId
} from "./dashboard-navigation";

describe("dashboard navigation route context", () => {
  it("finds event context on event routes", () => {
    expect(getDashboardEventId("/dashboard/events/event_123/staff/applications")).toBe("event_123");
  });

  it.each(["/dashboard/events/new", "/dashboard/events/new/staff"])(
    "does not treat the create-event route as event context: %s",
    (pathname) => {
      expect(getDashboardEventId(pathname)).toBeUndefined();
    }
  );

  it("finds organization context without treating its create route as an organization", () => {
    expect(getDashboardOrganizationId("/dashboard/organizations/org_123/settings")).toBe("org_123");
    expect(getDashboardOrganizationId("/dashboard/organizations/new")).toBeUndefined();
  });

  it("recognizes only non-reserved resource IDs", () => {
    expect(isDashboardResourceId("event_123")).toBe(true);
    expect(isDashboardResourceId("new")).toBe(false);
    expect(isDashboardResourceId(undefined)).toBe(false);
  });
});
