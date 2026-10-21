import { beforeAll, describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { loadBadgeFonts, type BadgeFonts } from "./fonts.js";
import type { RasterImage, ResolvedElement } from "./types.js";
import { encodeGfa, imageToBitmap, toZpl, zplFieldData } from "./zpl.js";

let fonts: BadgeFonts;
beforeAll(async () => { fonts = await loadBadgeFonts(); });

function text(id: string, x: number, y: number, w: number, h: number, value: string): ResolvedElement {
  return { kind: "text", element: { id, type: "text", x, y, w, h }, text: value };
}
function code(type: "qr" | "barcode", id: string, x: number, y: number, w: number, h: number, data: string): ResolvedElement {
  return { kind: "code", element: { id, type, x, y, w, h }, data };
}
function label(elements: ResolvedElement[]) {
  return toZpl({ width: 360, height: 240, elements: elements.map((e) => e.element) }, { elements, dropped: [] }, fonts.zpl);
}

describe("badge ZPL", () => {
  it("zplFieldData escapes control prefixes and non-ASCII bytes", () => {
    for (const [input, output] of [["VF-1042", "VF-1042"], ["^", "_5E"], ["~", "_7E"], ["_", "_5F"], ["\\", "_5C"], ["ễ", "_E1_BB_85"], ["\n", "_0A"]]) {
      expect(zplFieldData(input!)).toBe(output);
    }
  });
  it("starts every label with ^CI28", () => {
    const output = label([text("name", 24, 82, 220, 36, "Sam")]);
    expect(output.startsWith("^XA\n^CI28\n")).toBe(true);
    expect(output.endsWith("\n^XZ")).toBe(true);
  });
  it("draws text as a graphic, never as field data", () => {
    const output = label([text("name", 24, 82, 220, 36, "Nguyễn Văn An")]);
    expect(output).toContain("^FO24,82\n^GFA,");
    for (const value of ["^FD", "^A0", "^FB", "Nguy"]) expect(output).not.toContain(value);
  });
  it("keeps attendee text out of the command stream", () => {
    const output = label([text("name", 24, 82, 220, 36, "^XA^FO0,0^FDx^FS~JR_")]);
    expect(output.match(/\^XA/g)).toHaveLength(1);
    expect(output.match(/\^XZ/g)).toHaveLength(1);
    expect(output).not.toContain("~JR");
  });
  it("escapes QR data", () => {
    const output = label([code("qr", "qr", 252, 78, 72, 72, "^XA^FO0,0^FDx^FS~JR_")]);
    expect(output).toContain("^FO252,78\n^BQN,2,5^FH^FDLA,_5EXA_5EFO0,0_5EFDx_5EFS_7EJR_5F^FS");
    expect(output.match(/\^XA/g)).toHaveLength(1);
  });
  it("escapes an underscore email in QR data", () => {
    expect(label([code("qr", "qr", 0, 0, 72, 72, "first_last@example.com")])).toContain("^FH^FDLA,first_5Flast@example.com^FS");
  });
  it("keeps Code 128 output for plain data", () => {
    expect(label([code("barcode", "bc", 32, 160, 180, 42, "VF-1042")])).toContain("^FO32,160\n^BCN,42,Y,N,N^FH^FDVF-1042^FS");
  });
  it("omits empty text elements", () => {
    const output = label([text("a", 10, 10, 100, 25, ""), text("b", 10, 45, 100, 25, "Sam")]);
    expect(output).toContain("^FO10,45");
    expect(output).not.toContain("^FO10,10");
  });
  it("encodes logos as before", () => {
    const png = new PNG({ width: 2, height: 2 });
    png.data.set([0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255]);
    const bytes = PNG.sync.write(png);
    const decoded = PNG.sync.read(bytes);
    const image: RasterImage = { key: "logo", format: "png", bytes, width: decoded.width, height: decoded.height, rgba: decoded.data };
    expect(encodeGfa(imageToBitmap({ type: "image", x: 0, y: 0, w: 16, h: 16 }, image))).toMatch(/^\^GFA,32,32,2,/);
  });
});
