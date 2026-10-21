import { beforeAll, describe, expect, it } from "vitest";
import { FONT_DIRECTORY, loadBadgeFonts, readBadgeFonts, type BadgeFonts } from "./fonts.js";

let fonts: BadgeFonts;

beforeAll(async () => {
  fonts = await loadBadgeFonts();
});

describe("badge fonts", () => {
  it("loads both badge fonts", () => {
    expect(fonts.pdf.postscriptName).toBe("NotoSans-Regular");
    expect(fonts.zpl.postscriptName).toBe("NotoSans-CondensedBold");
    expect(fonts.pdfBytes.byteLength).toBe(431364);
  });

  it("covers every Vietnamese letter", () => {
    const letters = new Set<string>(["đ", "Đ"]);
    for (const base of "aăâeêioôơuưy") {
      for (const mark of ["", "\u0301", "\u0300", "\u0309", "\u0303", "\u0323"]) {
        const letter = (base + mark).normalize("NFC");
        letters.add(letter);
        letters.add(letter.toUpperCase());
      }
    }
    expect(letters.size).toBe(146);
    for (const letter of letters) {
      expect(letter).toHaveLength(1);
      for (const font of [fonts.pdf, fonts.zpl]) {
        expect(font.hasGlyphForCodePoint(letter.codePointAt(0)!)).toBe(true);
      }
    }
  });

  it("exposes the fontkit members the renderer uses", () => {
    const run = fonts.zpl.layout("Ấy");
    for (const position of run.positions) {
      expect(typeof position.xAdvance).toBe("number");
      expect(typeof position.xOffset).toBe("number");
      expect(typeof position.yOffset).toBe("number");
    }
    expect(typeof run.glyphs[0]!.path.toFunction()).toBe("function");
    expect(fonts.zpl.unitsPerEm).toBeGreaterThan(0);
    expect(fonts.zpl.ascent).toBeGreaterThan(0);
    expect(fonts.zpl.descent).toBeLessThan(0);
  });

  it("reports a missing font directory", async () => {
    await expect(readBadgeFonts(new URL("./missing-fonts/", FONT_DIRECTORY)))
      .rejects.toThrow(/^Badge fonts could not be loaded from /);
  });
});
