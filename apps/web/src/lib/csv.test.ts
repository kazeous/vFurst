import { describe, expect, it } from "vitest";
import { csvCell, serializeCsv } from "./csv";

describe("csvCell", () => {
  it.each(["=2+3", "+SUM(A1:A2)", "-2+3", "@SUM(A1:A2)", "  =2+3", "\t=2+3", "\r=2+3"])(
    "neutralizes spreadsheet formula prefix %j",
    (value) => {
      expect(csvCell(value)).toBe(`"'${value}"`);
    }
  );

  it("keeps numeric values numeric while escaping quotes", () => {
    expect(csvCell(-2500)).toBe('"-2500"');
    expect(csvCell('Convention "A"')).toBe('"Convention ""A"""');
  });
});

describe("serializeCsv", () => {
  it("uses interoperable CRLF row separators", () => {
    expect(serializeCsv([["Name", "Value"], ["Safe", 42]])).toBe('"Name","Value"\r\n"Safe","42"');
  });
});
