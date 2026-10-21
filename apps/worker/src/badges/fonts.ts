import fontkit, { type Font } from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export type BadgeFonts = { pdfBytes: Uint8Array; pdf: Font; zpl: Font };

type GlyphRecord = Uint8Array & {
  constructor: {
    concat(records: GlyphRecord[]): GlyphRecord;
    alloc(size: number): GlyphRecord;
  };
};

type GlyphSubset = ReturnType<Font["createSubset"]> & {
  _addGlyph(glyphId: number): number;
  glyf: GlyphRecord[];
  offset: number;
};

export const badgeFontkit: { create(buffer: Uint8Array, postscriptName?: string): Font } = {
  create(buffer, postscriptName) {
    const font = fontkit.create(buffer, postscriptName);
    const createSubset = font.createSubset.bind(font);
    font.createSubset = () => {
      const subset = createSubset() as GlyphSubset;
      const addGlyph = subset._addGlyph.bind(subset);
      // Fontkit 1.1.1's short loca truncates odd offsets from unpadded glyph records.
      subset._addGlyph = (glyphId) => {
        const index = addGlyph(glyphId);
        const record = subset.glyf[index]!;
        if (record.length % 2 !== 0) {
          const B = record.constructor;
          subset.glyf[index] = B.concat([record, B.alloc(1)]);
          subset.offset += 1;
        }
        return index;
      };
      return subset;
    };
    return font;
  }
};

export const FONT_DIRECTORY = new URL("../../assets/fonts/", import.meta.url);

export async function readBadgeFonts(directory: URL): Promise<BadgeFonts> {
  try {
    const [pdfBytes, zplBytes] = await Promise.all([
      readFile(new URL("NotoSans-Regular.ttf", directory)),
      readFile(new URL("NotoSans-CondensedBold.ttf", directory))
    ]);
    return { pdfBytes, pdf: fontkit.create(pdfBytes), zpl: fontkit.create(zplBytes) };
  } catch (cause) {
    throw new Error(`Badge fonts could not be loaded from ${fileURLToPath(directory)}.`, { cause });
  }
}

let fontsPromise: Promise<BadgeFonts> | undefined;

export function loadBadgeFonts(): Promise<BadgeFonts> {
  fontsPromise ??= readBadgeFonts(FONT_DIRECTORY).catch((cause) => {
    fontsPromise = undefined;
    throw cause;
  });
  return fontsPromise;
}
