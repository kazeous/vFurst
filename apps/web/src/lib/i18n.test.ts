import { describe, expect, it } from "vitest";
import { formatDate, formatDateRange } from "./i18n";

// Midday UTC keeps the calendar day stable in any test-runner time zone.
describe("formatDate", () => {
  it("puts the day before the month", () => {
    expect(formatDate(new Date("2027-03-14T12:00:00Z"))).toBe("14 Mar 2027");
    expect(formatDate("2027-03-14T12:00:00Z")).toBe("14 Mar 2027");
  });

  it("formats numeric dates as dd/mm/yyyy", () => {
    expect(formatDate("2027-03-04T12:00:00Z", { dateStyle: "short" })).toBe("04/03/2027");
  });
});

describe("formatDateRange", () => {
  it("puts the day before the month at both ends", () => {
    expect(formatDateRange("2027-08-01T12:00:00Z", "2027-08-03T12:00:00Z")).toBe("1 Aug 2027 – 3 Aug 2027");
  });
});
