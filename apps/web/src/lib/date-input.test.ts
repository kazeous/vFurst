import { describe, expect, it } from "vitest";
import { formatDayFirstDate, parseDayFirstDate } from "./date-input";

describe("parseDayFirstDate", () => {
  it("reads dd/mm/yyyy as an ISO date", () => {
    expect(parseDayFirstDate("18/10/2026")).toBe("2026-10-18");
  });

  it("reads the day before the month", () => {
    expect(parseDayFirstDate("01/02/2027")).toBe("2027-02-01");
  });

  it("accepts single-digit parts and surrounding whitespace", () => {
    expect(parseDayFirstDate(" 1/2/2027 ")).toBe("2027-02-01");
  });

  it.each(["18.10.2026", "18-10-2026"])("accepts the separator in %j", (text) => {
    expect(parseDayFirstDate(text)).toBe("2026-10-18");
  });

  it("accepts a leap day in a leap year", () => {
    expect(parseDayFirstDate("29/02/2028")).toBe("2028-02-29");
  });

  it.each(["31/02/2027", "29/02/2027", "31/04/2027", "00/10/2026", "10/00/2026", "10/18/2026", "18/13/2026"])(
    "rejects the impossible date %j",
    (text) => {
      expect(parseDayFirstDate(text)).toBeNull();
    }
  );

  it.each(["", "abc", "18/10", "18/10/26", "2026-10-18", "18/10/2026x", "18/10/0202"])("rejects the malformed input %j", (text) => {
    expect(parseDayFirstDate(text)).toBeNull();
  });
});

describe("formatDayFirstDate", () => {
  it("shows an ISO date as dd/mm/yyyy", () => {
    expect(formatDayFirstDate("2026-10-18")).toBe("18/10/2026");
    expect(formatDayFirstDate("2027-02-01")).toBe("01/02/2027");
  });

  it.each(["", "2026-02-30", "18/10/2026", "2026-10-18T00:00:00.000Z"])("shows nothing for the non-date value %j", (value) => {
    expect(formatDayFirstDate(value)).toBe("");
  });
});
