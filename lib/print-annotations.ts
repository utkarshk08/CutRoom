import { printPlacementFootprint, type PrintPackPage } from './studio.ts';

type Placement = PrintPackPage['placements'][number];
type Rect = { x: number; y: number; w: number; h: number };
export type PrintMark = { x1: number; y1: number; x2: number; y2: number };
export const PRINT_MARK_WIDTH_CM = 0.4 / 72 * 2.54;
const clearance = PRINT_MARK_WIDTH_CM / 2 + .002;

function rectangles(placements: readonly Placement[]): Rect[] {
  return placements.map((placement) => {
    const size = printPlacementFootprint(placement);
    return { x: placement.xCm, y: placement.yCm, w: size.widthCm, h: size.heightCm };
  });
}

/** Annotation ink must fit on the sheet and remain outside every photo. */
export function isPrintAnnotationClear(rect: Rect, placements: readonly Placement[], sheetW: number, sheetH: number) {
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > sheetW || rect.y + rect.h > sheetH) return false;
  return rectangles(placements).every((photo) => rect.x + rect.w <= photo.x - clearance
    || rect.x >= photo.x + photo.w + clearance
    || rect.y + rect.h <= photo.y - clearance
    || rect.y >= photo.y + photo.h + clearance);
}

/** Shared centimetre geometry for preview, PDF and raster exports. */
export function printCropMarkSegments(placements: readonly Placement[], sheetW: number, sheetH: number): PrintMark[] {
  const photos = rectangles(placements);
  const marks: PrintMark[] = [];
  for (const photo of photos) {
    for (const x of [photo.x, photo.x + photo.w]) {
      for (const y of [photo.y, photo.y + photo.h]) {
        const left = x === photo.x;
        const top = y === photo.y;
        const candidates: PrintMark[] = [
          { x1: x + (left ? -.26 : .04), y1: y, x2: x + (left ? -.04 : .26), y2: y },
          { x1: x, y1: y + (top ? -.26 : .04), x2: x, y2: y + (top ? -.04 : .26) },
        ];
        for (const line of candidates) {
          const horizontal = line.y1 === line.y2;
          const cross = horizontal ? line.y1 : line.x1;
          const crossLimit = horizontal ? sheetH : sheetW;
          if (cross < clearance || cross > crossLimit - clearance) continue;
          let spans = [[Math.max(clearance, horizontal ? line.x1 : line.y1), Math.min((horizontal ? sheetW : sheetH) - clearance, horizontal ? line.x2 : line.y2)]];
          for (const other of photos) {
            const near = (horizontal ? other.y : other.x) - clearance;
            const far = (horizontal ? other.y + other.h : other.x + other.w) + clearance;
            if (cross < near || cross > far) continue;
            const start = (horizontal ? other.x : other.y) - clearance;
            const end = (horizontal ? other.x + other.w : other.y + other.h) + clearance;
            spans = spans.flatMap(([a, b]) => end <= a || start >= b ? [[a, b]] : [[a, Math.min(b, start)], [Math.max(a, end), b]]);
          }
          for (const [a, b] of spans) {
            if (b - a < .03) continue;
            marks.push(horizontal ? { x1: a, y1: cross, x2: b, y2: cross } : { x1: cross, y1: a, x2: cross, y2: b });
          }
        }
      }
    }
  }
  return marks;
}
