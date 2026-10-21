import { beforeAll, describe, expect, it } from "vitest";
import fontkit, { type Path } from "@pdf-lib/fontkit";
import { decodePDFRawStream, PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { badgeFontkit, FONT_DIRECTORY, loadBadgeFonts, readBadgeFonts, type BadgeFonts } from "./fonts.js";

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

  it("subset fonts embed every glyph outline unchanged", async () => {
    const sample = "Artifact Event Nguyễn Thị Ánh Tuyết Ếch Xanh Zoë Ångström-Łukasz Đức ^XA~JR_ Injector… Привет Γειά Ỹỹ Ựự";
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(badgeFontkit);
    const font = await pdf.embedFont(fonts.pdfBytes, { subset: true });
    pdf.addPage().drawText(sample, { font, size: 10 });
    const doc = await PDFDocument.load(await pdf.save());
    const descriptors = doc.context.enumerateIndirectObjects().map(([, object]) => object)
      .filter((object): object is PDFDict => object instanceof PDFDict && object.get(PDFName.of("Type")) === PDFName.of("FontDescriptor"));
    expect(descriptors).toHaveLength(1);
    const stream = doc.context.lookup(descriptors[0]!.get(PDFName.of("FontFile2")));
    if (!(stream instanceof PDFRawStream)) throw new Error("Expected an embedded font stream.");
    const embedded = fontkit.create(Buffer.from(decodePDFRawStream(stream).decode()));
    for (let gid = 0; gid < embedded.numGlyphs; gid += 1) {
      expect(() => (embedded.getGlyph(gid).path as Path & { commands: unknown[] }).commands, `embedded glyph ${gid}`).not.toThrow();
    }
    const mirror = fonts.pdf.createSubset();
    const mapping = new Map(fonts.pdf.layout(sample).glyphs.map((glyph) => [glyph.id, mirror.includeGlyph(glyph.id)]));
    for (const [original, subset] of mapping) {
      expect(embedded.getGlyph(subset).path.toSVG(), `original glyph ${original}, subset glyph ${subset}`)
        .toBe(fonts.pdf.getGlyph(original).path.toSVG());
    }
  });

  it("reports a missing font directory", async () => {
    await expect(readBadgeFonts(new URL("./missing-fonts/", FONT_DIRECTORY)))
      .rejects.toThrow(/^Badge fonts could not be loaded from /);
  });
});
