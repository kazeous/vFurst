import { describe, expect, it } from "vitest";
import { pickInitialAttendee } from "./attendee-selection";

const attendees = [
  { id: "friend", registered: false, isAccountHolder: false },
  { id: "self", registered: false, isAccountHolder: true },
  { id: "registered", registered: true, isAccountHolder: false }
];

describe("initial attendee selection", () => {
  it("prefers a free requested attendee", () => {
    expect(pickInitialAttendee(attendees, "friend")).toBe("friend");
  });

  it("ignores a requested id that is registered, unknown, or belongs to no listed attendee and falls back to the free account holder", () => {
    for (const requested of ["registered", "deleted", "foreign", null]) {
      expect(pickInitialAttendee(attendees, requested)).toBe("self");
    }
  });

  it("falls back to the first free attendee", () => {
    expect(pickInitialAttendee(attendees.map((attendee) => attendee.isAccountHolder ? { ...attendee, registered: true } : attendee), null)).toBe("friend");
  });

  it("returns null when every attendee is registered", () => {
    expect(pickInitialAttendee(attendees.map((attendee) => ({ ...attendee, registered: true })), "self")).toBeNull();
    expect(pickInitialAttendee([], null)).toBeNull();
  });
});
