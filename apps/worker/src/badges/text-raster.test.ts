import { beforeAll, describe, expect, it } from "vitest";
import { loadBadgeFonts, type BadgeFonts } from "./fonts.js";
import { rasterizeBadgeText } from "./text-raster.js";
import type { Bitmap } from "./types.js";

let zpl: BadgeFonts["zpl"];

beforeAll(async () => {
  zpl = (await loadBadgeFonts()).zpl;
});

function columns(image: Bitmap, width: number, row: number) {
  return Array.from({ length: width }, (_, column) => column)
    .filter((column) => (image.bitmap[row * image.bytesPerRow + Math.floor(column / 8)]! & (0x80 >> (column % 8))) !== 0);
}

describe("badge text rasterizer", () => {
  it("draws a lowercase l as one solid vertical bar", () => {
    const image = rasterizeBadgeText(zpl, "l", 40, 20, 50);
    const inkRows = Array.from({ length: image.rows }, (_, row) => columns(image, 20, row)).filter((row) => row.length > 0);
    expect(inkRows.length).toBeGreaterThanOrEqual(20);
    const common = new Set(inkRows[0]);
    for (const row of inkRows) {
      expect(row[row.length - 1]! - row[0]! + 1).toBe(row.length);
      for (const column of common) {
        if (!row.includes(column)) common.delete(column);
      }
    }
    expect(common.size).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    expect(rasterizeBadgeText(zpl, "Nguyễn Văn An", 25, 220, 40).bitmap)
      .toEqual(rasterizeBadgeText(zpl, "Nguyễn Văn An", 25, 220, 40).bitmap);
  });

  it("returns a blank bitmap for empty text", () => {
    const image = rasterizeBadgeText(zpl, "", 40, 20, 50);
    expect(image.bytesPerRow).toBe(3);
    expect(image.rows).toBe(50);
    expect(image.bitmap.every((byte) => byte === 0)).toBe(true);
  });

  it("clips ink and zeroes padding bits", () => {
    const image = rasterizeBadgeText(zpl, "WWWW", 40, 10, 50);
    expect(image.bytesPerRow).toBe(2);
    image.bitmap.forEach((byte, index) => {
      if (index % 2 === 1) expect(byte & 0b0011_1111).toBe(0);
    });
  });

  it("draws stacked Vietnamese marks above the capital", () => {
    const top = (text: string) => {
      const image = rasterizeBadgeText(zpl, text, 40, 40, 60);
      return Array.from({ length: image.rows }, (_, row) => columns(image, 40, row))
        .findIndex((row) => row.length > 0);
    };
    const accentTop = top("Ễ");
    const baseTop = top("E");
    expect(accentTop).toBeGreaterThanOrEqual(0);
    expect(baseTop).toBeGreaterThanOrEqual(0);
    expect(accentTop).toBeLessThan(baseTop);
  });

  it("survives a one-dot box", () => {
    expect(rasterizeBadgeText(zpl, "Ab", 18, 1, 1)).toMatchObject({ bytesPerRow: 1, rows: 1 });
  });
});
