import type { Font } from "@pdf-lib/fontkit";

export type MeasureText = (text: string, size: number) => number;
export type FittedText = { text: string; size: number; truncated: boolean };

export function measureWith(font: Font): MeasureText {
  return (text, size) => font.layout(text).glyphs.reduce((width, glyph) => width + glyph.advanceWidth, 0) * size / font.unitsPerEm;
}

export function fitBadgeText(text: string, maxWidth: number, baseSize: number, measure: MeasureText): FittedText {
  if (!text) return { text, size: baseSize, truncated: false };
  const width = measure(text, baseSize);
  if (width <= maxWidth) return { text, size: baseSize, truncated: false };
  const fittedSize = baseSize * maxWidth / width;
  const minimumSize = 0.6 * baseSize;
  if (fittedSize >= minimumSize) return { text, size: fittedSize, truncated: false };
  if (measure("…", minimumSize) > maxWidth) return { text: "", size: minimumSize, truncated: true };

  let prefix = "";
  let fitted = "…";
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  for (const { segment } of segmenter.segment(text)) {
    prefix += segment;
    const candidate = `${prefix.trimEnd()}…`;
    if (measure(candidate, minimumSize) <= maxWidth) fitted = candidate;
  }
  return { text: fitted, size: minimumSize, truncated: true };
}
