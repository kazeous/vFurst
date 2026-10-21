import type { Font } from "@pdf-lib/fontkit";
import { fitBadgeText, measureWith } from "./text-layout.js";
import { rasterizeBadgeText } from "./text-raster.js";
import type { BadgeContent, BadgeElement, BadgeLayout, Bitmap, RasterImage } from "./types.js";

export function zplFieldData(value: string): string {
  return Array.from(Buffer.from(value, "utf8"), (byte) =>
    byte >= 0x20 && byte <= 0x7e && ![0x5e, 0x7e, 0x5f, 0x5c].includes(byte)
      ? String.fromCharCode(byte)
      : `_${byte.toString(16).padStart(2, "0").toUpperCase()}`
  ).join("");
}

export function encodeGfa({ bitmap, bytesPerRow }: Bitmap): string {
  return `^GFA,${bitmap.length},${bitmap.length},${bytesPerRow},${Buffer.from(bitmap).toString("hex").toUpperCase()}^FS`;
}

export function imageToBitmap(element: BadgeElement, image: RasterImage): Bitmap {
  const width = Math.max(1, Math.round(element.w));
  const height = Math.max(1, Math.round(element.h));
  const bytesPerRow = Math.ceil(width / 8);
  const bitmap = Buffer.alloc(bytesPerRow * height);

  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(image.height - 1, Math.floor((y * image.height) / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(image.width - 1, Math.floor((x * image.width) / width));
      const offset = (sourceY * image.width + sourceX) * 4;
      const alpha = image.rgba[offset + 3]! / 255;
      const red = image.rgba[offset]! * alpha + 255 * (1 - alpha);
      const green = image.rgba[offset + 1]! * alpha + 255 * (1 - alpha);
      const blue = image.rgba[offset + 2]! * alpha + 255 * (1 - alpha);
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

      if (luminance < 180) {
        bitmap[y * bytesPerRow + Math.floor(x / 8)]! |= 0x80 >> (x % 8);
      }
    }
  }

  return { bitmap, bytesPerRow, rows: height };
}

export function toZpl(_layout: BadgeLayout, content: BadgeContent, zplFont: Font): string {
  const commands = ["^XA", "^CI28"];
  for (const resolved of content.elements) {
    const { element } = resolved;
    let block: string;
    if (resolved.kind === "text") {
      const width = Math.max(1, Math.round(element.w));
      const fitted = fitBadgeText(resolved.text, width, Math.max(18, Math.round(element.h * 0.7)), measureWith(zplFont));
      if (!fitted.text) continue;
      const height = Math.max(1, Math.round(element.h), Math.ceil((zplFont.ascent - zplFont.descent) * fitted.size / zplFont.unitsPerEm));
      block = encodeGfa(rasterizeBadgeText(zplFont, fitted.text, fitted.size, width, height));
    } else if (resolved.kind === "image") {
      block = encodeGfa(imageToBitmap(element, resolved.image));
    } else if (element.type === "qr") {
      block = `^BQN,2,5^FH^FDLA,${zplFieldData(resolved.data)}^FS`;
    } else {
      block = `^BCN,${Math.round(element.h)},Y,N,N^FH^FD${zplFieldData(resolved.data)}^FS`;
    }
    commands.push(`^FO${Math.round(element.x)},${Math.round(element.y)}`, block);
  }
  return [...commands, "^XZ"].join("\n");
}
