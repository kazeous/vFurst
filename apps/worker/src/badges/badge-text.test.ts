import { beforeAll, describe, expect, it } from "vitest";
import { loadBadgeFonts, type BadgeFonts } from "./fonts.js";
import { prepareBadgeText } from "./badge-text.js";

let both: BadgeFonts["pdf"][];

beforeAll(async () => {
  const fonts = await loadBadgeFonts();
  both = [fonts.pdf, fonts.zpl];
});

describe("badge text preparation", () => {
  it("normalizes decomposed Vietnamese to NFC", () => {
    expect(prepareBadgeText("Nguyễn Văn An".normalize("NFD"), both)).toEqual({ text: "Nguyễn Văn An", dropped: [] });
  });

  it("collapses Unicode whitespace", () => {
    expect(prepareBadgeText(" Ánh\u00A0\u3000 Tuyết\t\n", both)).toEqual({ text: "Ánh Tuyết", dropped: [] });
  });

  it("strips invisible characters without reporting them", () => {
    expect(prepareBadgeText("A\u200Bur\u200Dora\uFE0F\u00AD", both)).toEqual({ text: "Aurora", dropped: [] });
  });

  it("drops unprintable characters and reports each once", () => {
    expect(prepareBadgeText("Aurora 🦊 ★ 🦊 山", both)).toEqual({ text: "Aurora", dropped: ["🦊", "★", "山"] });
  });

  it("returns empty text for whitespace and invisible-only input", () => {
    expect(prepareBadgeText(" \u200B\uFE0F ", both)).toEqual({ text: "", dropped: [] });
  });

  it("keeps a code point only when every font has it", () => {
    expect(prepareBadgeText("ABA", [both[0]!, { hasGlyphForCodePoint: (cp: number) => cp !== 0x41 }]))
      .toEqual({ text: "B", dropped: ["A"] });
  });
});
