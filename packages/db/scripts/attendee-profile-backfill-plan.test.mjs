import { describe, expect, it } from "vitest";
import { planAttendeeProfileBackfill } from "./attendee-profile-backfill-plan.mjs";

const account = { id: "a1", orgId: "o1", name: "Mai Le", email: "mai@example.com" };
const registration = (id, eventId = "e1", status = "CONFIRMED", createdAt = "2026-01-01T00:00:00Z") => ({
  id, portalAccountId: "a1", eventId, status, createdAt: new Date(createdAt)
});

function plan(registrations, accounts = [account], existingSelfProfiles = []) {
  let next = 0;
  return planAttendeeProfileBackfill({ accounts, registrations, existingSelfProfiles, newId: () => `p${++next}` });
}

describe("attendee-profile backfill planner", () => {
  it("gives each account one self profile and assigns its first active registration per event", () => {
    const result = plan([registration("r1"), registration("r2", "e2")]);
    expect(result.profiles).toEqual([{ id: "p1", orgId: "o1", portalAccountId: "a1", accountHolderOf: "a1", fullName: "Mai Le" }]);
    expect(result.assignments).toEqual([
      { registrationId: "r1", attendeeProfileId: "p1" },
      { registrationId: "r2", attendeeProfileId: "p1" }
    ]);
  });

  it("numbers extra profiles for additional active registrations and reuses them across events", () => {
    const result = plan([
      registration("r1"), registration("r2", "e1", "PENDING", "2026-01-02T00:00:00Z"),
      registration("r3", "e2", "CHECKED_IN"), registration("r4", "e2", "CONFIRMED", "2026-01-02T00:00:00Z")
    ]);
    expect(result.profiles.map(({ fullName, accountHolderOf }) => ({ fullName, accountHolderOf }))).toEqual([
      { fullName: "Mai Le", accountHolderOf: "a1" }, { fullName: "Mai Le (2)", accountHolderOf: null }
    ]);
    expect(result.assignments).toEqual([
      { registrationId: "r1", attendeeProfileId: "p1" }, { registrationId: "r2", attendeeProfileId: "p2" },
      { registrationId: "r3", attendeeProfileId: "p1" }, { registrationId: "r4", attendeeProfileId: "p2" }
    ]);
  });

  it("points cancelled and transferred registrations at the self profile", () => {
    const result = plan([registration("r1", "e1", "CANCELLED"), registration("r2", "e1", "TRANSFERRED"), registration("r3")]);
    expect(result.profiles).toHaveLength(1);
    expect(result.assignments.map(({ attendeeProfileId }) => attendeeProfileId)).toEqual(["p1", "p1", "p1"]);
  });

  it("breaks createdAt ties by registration id", () => {
    const result = plan([registration("r2"), registration("r1")]);
    expect(result.assignments.find(({ registrationId }) => registrationId === "r1").attendeeProfileId).toBe("p1");
    expect(result.assignments.find(({ registrationId }) => registrationId === "r2").attendeeProfileId).toBe("p2");
  });

  it("names the self profile from the trimmed name, falling back to the email, within 120 characters", () => {
    expect(plan([registration("r1")], [{ ...account, name: "  Mai Le  " }]).profiles[0].fullName).toBe("Mai Le");
    expect(plan([registration("r1")], [{ ...account, name: null }]).profiles[0].fullName).toBe("mai@example.com");
    const result = plan([registration("r1"), registration("r2")], [{ ...account, name: "a".repeat(130) }]);
    expect(result.profiles[0].fullName).toHaveLength(120);
    expect(result.profiles[1].fullName).toHaveLength(120);
    expect(result.profiles[1].fullName.endsWith(" (2)")).toBe(true);
  });

  it("reuses an existing self profile instead of creating one", () => {
    const result = plan([registration("r1")], [account], [{ id: "existing", portalAccountId: "a1" }]);
    expect(result.profiles).toEqual([]);
    expect(result.assignments).toEqual([{ registrationId: "r1", attendeeProfileId: "existing" }]);
  });
});
