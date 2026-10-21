import fontkit, { type Font } from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export type BadgeFonts = { pdfBytes: Uint8Array; pdf: Font; zpl: Font };

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
