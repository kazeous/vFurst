import type { Font } from "@pdf-lib/fontkit";
import type { Bitmap } from "./types.js";

type Point = { x: number; y: number };
type Edge = { from: Point; to: Point };

function outlineRecorder(ox: number, oy: number, scale: number, edges: Edge[]) {
  let current: Point = { x: 0, y: 0 };
  let start = current;
  const pixel = (point: Point): Point => ({ x: ox + point.x * scale, y: oy - point.y * scale });
  const lineTo = (x: number, y: number) => {
    const next = { x, y };
    edges.push({ from: pixel(current), to: pixel(next) });
    current = next;
  };

  return {
    beginPath() {},
    fill() {},
    moveTo(x: number, y: number) {
      current = { x, y };
      start = current;
    },
    lineTo,
    closePath() {
      lineTo(start.x, start.y);
    },
    quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
      const from = current;
      for (let segment = 1; segment <= 8; segment++) {
        const t = segment / 8;
        const u = 1 - t;
        lineTo(u * u * from.x + 2 * u * t * cx + t * t * x,
          u * u * from.y + 2 * u * t * cy + t * t * y);
      }
    },
    bezierCurveTo(cx1: number, cy1: number, cx2: number, cy2: number, x: number, y: number) {
      const from = current;
      for (let segment = 1; segment <= 12; segment++) {
        const t = segment / 12;
        const u = 1 - t;
        lineTo(u ** 3 * from.x + 3 * u * u * t * cx1 + 3 * u * t * t * cx2 + t ** 3 * x,
          u ** 3 * from.y + 3 * u * u * t * cy1 + 3 * u * t * t * cy2 + t ** 3 * y);
      }
    }
  };
}

export function rasterizeBadgeText(font: Font, text: string, size: number, width: number, height: number): Bitmap {
  const bytesPerRow = Math.ceil(width / 8);
  const bitmap = new Uint8Array(bytesPerRow * height);
  if (!text) return { bytesPerRow, rows: height, bitmap };

  const scale = size / font.unitsPerEm;
  const baseline = Math.round(font.ascent * scale);
  const edges: Edge[] = [];
  const run = font.layout(text);
  let penX = 0;
  run.glyphs.forEach((glyph, index) => {
    const position = run.positions[index]!;
    const ox = (penX + position.xOffset) * scale;
    const oy = baseline - position.yOffset * scale;
    glyph.path.toFunction()(outlineRecorder(ox, oy, scale, edges));
    penX += glyph.advanceWidth;
  });

  const coverage = new Uint8Array(width * height);
  for (let row = 0; row < height; row++) {
    for (let sampleY = 0; sampleY < 4; sampleY++) {
      const sy = row + (sampleY + 0.5) / 4;
      const crossings: Array<{ x: number; direction: number }> = [];
      for (const { from, to } of edges) {
        if ((from.y <= sy && sy < to.y) || (to.y <= sy && sy < from.y)) {
          crossings.push({
            x: from.x + (sy - from.y) * (to.x - from.x) / (to.y - from.y),
            direction: to.y > from.y ? 1 : -1
          });
        }
      }
      crossings.sort((left, right) => left.x - right.x);
      let winding = 0;
      let spanStart = 0;
      for (const crossing of crossings) {
        const previous = winding;
        winding += crossing.direction;
        if (previous === 0 && winding !== 0) {
          spanStart = crossing.x;
        } else if (previous !== 0 && winding === 0) {
          const first = Math.max(0, Math.ceil(spanStart * 4 - 0.5));
          const end = Math.min(width * 4, Math.ceil(crossing.x * 4 - 0.5));
          for (let sampleX = first; sampleX < end; sampleX++) {
            const index = row * width + Math.floor(sampleX / 4);
            coverage[index] = coverage[index]! + 1;
          }
        }
      }
    }
    for (let column = 0; column < width; column++) {
      if (coverage[row * width + column]! >= 8) {
        const index = row * bytesPerRow + Math.floor(column / 8);
        bitmap[index] = bitmap[index]! | (0x80 >> (column % 8));
      }
    }
  }
  return { bytesPerRow, rows: height, bitmap };
}
