import { describe, expect, it } from "vitest";
import { attendeeRefreshState, pickInitialAttendee } from "./attendee-selection";

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

describe("attendee refresh state", () => {
  it("is idle before any attendee is added", () => {
    expect(attendeeRefreshState(undefined, null)).toEqual({ loading: false, loadFailed: false });
  });

  it("loads until the added profile's result arrives", () => {
    expect(attendeeRefreshState("p1", null)).toEqual({ loading: true, loadFailed: false });
  });

  it("stays loading until the current profile's result arrives", () => {
    expect(attendeeRefreshState("p2", { profileId: "p1", ok: true })).toEqual({ loading: true, loadFailed: false });
  });

  it("stops loading on success", () => {
    expect(attendeeRefreshState("p1", { profileId: "p1", ok: true })).toEqual({ loading: false, loadFailed: false });
  });

  it("reports a failed refresh", () => {
    expect(attendeeRefreshState("p1", { profileId: "p1", ok: false })).toEqual({ loading: false, loadFailed: true });
  });
});
