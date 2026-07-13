import { describe, expect, it } from "vitest";
import { formatMoneyInput, parseMoney } from "./pricing";

describe("money input formatting", () => {
  it("round-trips USD cents through decimal organizer inputs", () => {
    expect(formatMoneyInput(12_345, "USD")).toBe("123.45");
    expect(parseMoney("123.45", "USD")).toBe(12_345);
  });

  it("round-trips VND as whole dong without dividing by 100", () => {
    expect(formatMoneyInput(125_000, "VND")).toBe("125000");
    expect(parseMoney("125000", "VND")).toBe(125_000);
  });
});
