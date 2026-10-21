import type { Font } from "@pdf-lib/fontkit";

export function prepareBadgeText(
  raw: string,
  fonts: readonly Pick<Font, "hasGlyphForCodePoint">[]
): { text: string; dropped: string[] } {
  const normalized = raw.normalize("NFC").replace(/\s+/gu, " ")
    .replace(/[\p{Cc}\p{Cf}\p{Cs}\u{FE00}-\u{FE0F}\u{E0100}-\u{E01EF}]/gu, "");
  let text = "";
  const dropped = new Set<string>();
  for (const character of normalized) {
    if (fonts.every((font) => font.hasGlyphForCodePoint(character.codePointAt(0)!))) {
      text += character;
    } else {
      dropped.add(character);
    }
  }
  return { text: text.replace(/\s+/gu, " ").trim(), dropped: [...dropped] };
}
