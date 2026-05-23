import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("volunteer helpers", () => {
  it("opens volunteer applications only while registration or live operations are active", async () => {
    const { assertVolunteerApplicationsOpen } = await import("@/server/volunteers");

    expect(() => assertVolunteerApplicationsOpen({ status: "REGISTRATION_OPEN" })).not.toThrow();
    expect(() => assertVolunteerApplicationsOpen({ status: "LIVE" })).not.toThrow();
    expect(() => assertVolunteerApplicationsOpen({ status: "DRAFT" })).toThrow("Volunteer applications are not open");
    expect(() => assertVolunteerApplicationsOpen({ status: "CLOSED" })).toThrow("Volunteer applications are not open");
  });
});
