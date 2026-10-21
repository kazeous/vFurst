import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { loadBadgeFonts, type BadgeFonts } from "./fonts.js";
import { fitBadgeText, measureWith, type FittedText } from "./text-layout.js";

const half = (text: string, size: number) => [...text].length * size * 0.5;
let fonts: BadgeFonts;

beforeAll(async () => {
  fonts = await loadBadgeFonts();
});

function expectFit(result: FittedText, text: string, size: number, truncated: boolean) {
  expect(result.text).toBe(text);
  expect(result.size).toBeCloseTo(size);
  expect(result.truncated).toBe(truncated);
}

describe("one-line badge text layout", () => {
  it("keeps the base size when the text fits", () => {
    expectFit(fitBadgeText("abcd", 100, 20, half), "abcd", 20, false);
  });

  it("shrinks a too-wide line to fit exactly", () => {
    expectFit(fitBadgeText("abcdefghij", 80, 20, half), "abcdefghij", 16, false);
  });

  it("cuts with an ellipsis below sixty percent", () => {
    expectFit(fitBadgeText("abcdefghijklmnopqrst", 60, 20, half), "abcdefghi…", 0.6 * 20, true);
  });

  it("trims trailing spaces before the ellipsis", () => {
    expect(fitBadgeText("abcd efgh ijkl mnop", 36, 20, half).text).toBe("abcd…");
  });

  it("never splits a grapheme", () => {
    expect(fitBadgeText("q́".repeat(20), 40, 20, half).text).toMatch(/^(q́)+…$/u);
  });

  it("returns empty text when not even the ellipsis fits", () => {
    expectFit(fitBadgeText("abc".repeat(10), 2, 20, half), "", 0.6 * 20, true);
  });

  it("returns empty input unchanged", () => {
    expectFit(fitBadgeText("", 100, 20, half), "", 20, false);
  });

  it("truncates a long unbroken name within the box", () => {
    const measure = measureWith(fonts.pdf);
    const result = fitBadgeText("W".repeat(120), 330, 13.75, measure);
    expect(result.truncated).toBe(true);
    expect(result.text.endsWith("…")).toBe(true);
    expect(result.size).toBeCloseTo(0.6 * 13.75);
    expect(measure(result.text, result.size)).toBeLessThanOrEqual(330);
  });

  it("measures like pdf-lib", async () => {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const font = await pdf.embedFont(fonts.pdfBytes, { subset: true });
    expect(Math.abs(measureWith(fonts.pdf)("Nguyễn Văn An", 14) - font.widthOfTextAtSize("Nguyễn Văn An", 14)))
      .toBeLessThan(0.01);
  });
});
