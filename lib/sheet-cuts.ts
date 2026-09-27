export type CutRect = { x: number; y: number; w: number; h: number };

export const CUT_SHAPES = [
  'rectangle',
  'ellipse',
  'heart',
  'diamond',
  'polygon',
] as const;
export type CutShape = (typeof CUT_SHAPES)[number];

/** A point normalized to a cut region's own bounds. */
export type CutPoint = { x: number; y: number };

export type CutRegion = {
  /** Stable caller-owned identity. Geometry helpers never replace it. */
  id: string;
  shape: CutShape;
  /** Axis-aligned image-normalized bounds in the inclusive range 0..1. */
  bounds: CutRect;
  /** Polygon vertices normalized relative to bounds, not the full image. */
  points?: CutPoint[];
  /** Optional caller-defined provenance such as "manual" or "auto-grid". */
  source?: string;
};

export type CutResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export type PixelCutBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CutPathSink = {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(
    control1X: number,
    control1Y: number,
    control2X: number,
    control2Y: number,
    x: number,
    y: number,
  ): void;
  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
  ): void;
  closePath(): void;
};

export const MIN_CUT_REGION_SIZE = 0.005;
export const MAX_CUT_POLYGON_POINTS = 512;

const CUT_REGION_ID_MAX_LENGTH = 96;
const CUT_REGION_SOURCE_MAX_LENGTH = 120;
const POINT_EPSILON = 0.000001;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return Array.from(value)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('')
    .trim()
    .slice(0, maxLength);
}

function cloneRegion(region: CutRegion, bounds = region.bounds): CutRegion {
  return {
    ...region,
    bounds: { ...bounds },
    ...(region.points
      ? { points: region.points.map((point) => ({ ...point })) }
      : {}),
  };
}

function pointDistanceSquared(a: CutPoint, b: CutPoint) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function withoutRepeatedNeighbours(points: CutPoint[]) {
  const result = points.filter(
    (point, index) =>
      index === 0 ||
      pointDistanceSquared(point, points[index - 1]) > POINT_EPSILON ** 2,
  );
  if (
    result.length > 1 &&
    pointDistanceSquared(result[0], result[result.length - 1]) <=
      POINT_EPSILON ** 2
  ) {
    result.pop();
  }
  return result;
}

function evenlyLimitPoints(points: CutPoint[]) {
  if (points.length <= MAX_CUT_POLYGON_POINTS) return points;
  return Array.from(
    { length: MAX_CUT_POLYGON_POINTS },
    (_, index) =>
      points[
        Math.round((index / (MAX_CUT_POLYGON_POINTS - 1)) * (points.length - 1))
      ],
  );
}

function polygonArea(points: readonly CutPoint[]) {
  return Math.abs(
    points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2,
  );
}

function sanitizeRelativePoints(value: unknown): CutPoint[] | null {
  if (!Array.isArray(value)) return null;
  const points = evenlyLimitPoints(
    value.flatMap((entry): CutPoint[] => {
      if (!isRecord(entry) || !finite(entry.x) || !finite(entry.y)) return [];
      return [{ x: clamp(entry.x, 0, 1), y: clamp(entry.y, 0, 1) }];
    }),
  );
  const unique = withoutRepeatedNeighbours(points);
  if (unique.length < 3 || polygonArea(unique) <= POINT_EPSILON) return null;
  return unique;
}

function sanitizeBounds(value: unknown): CutRect | null {
  if (
    !isRecord(value) ||
    !finite(value.x) ||
    !finite(value.y) ||
    !finite(value.w) ||
    !finite(value.h)
  ) {
    return null;
  }
  const rawRight = value.x + value.w;
  const rawBottom = value.y + value.h;
  const left = clamp(Math.min(value.x, rawRight), 0, 1);
  const right = clamp(Math.max(value.x, rawRight), 0, 1);
  const top = clamp(Math.min(value.y, rawBottom), 0, 1);
  const bottom = clamp(Math.max(value.y, rawBottom), 0, 1);
  if (right - left < MIN_CUT_REGION_SIZE || bottom - top < MIN_CUT_REGION_SIZE)
    return null;
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * Validate persisted or imported region data. Invalid IDs, bounds, and
 * polygons are rejected instead of being assigned a new identity.
 */
export function sanitizeCutRegion(value: unknown): CutRegion | null {
  if (!isRecord(value)) return null;
  const id = cleanText(value.id, CUT_REGION_ID_MAX_LENGTH);
  const shape = CUT_SHAPES.includes(value.shape as CutShape)
    ? (value.shape as CutShape)
    : undefined;
  const bounds = sanitizeBounds(value.bounds);
  if (!id || !shape || !bounds) return null;
  const points =
    shape === 'polygon' ? sanitizeRelativePoints(value.points) : undefined;
  if (shape === 'polygon' && !points) return null;
  const source = cleanText(value.source, CUT_REGION_SOURCE_MAX_LENGTH);
  return {
    id,
    shape,
    bounds,
    ...(points ? { points } : {}),
    ...(source ? { source } : {}),
  };
}

/**
 * Create a polygon region from points normalized to the full source image.
 * Stored vertices are converted to coordinates relative to the tight bounds.
 */
export function createPolygonCutRegion(
  id: string,
  imagePoints: readonly CutPoint[],
  source?: string,
): CutRegion | null {
  const cleanId = cleanText(id, CUT_REGION_ID_MAX_LENGTH);
  if (!cleanId) return null;
  const absolutePoints = evenlyLimitPoints(
    withoutRepeatedNeighbours(
      imagePoints.flatMap((point): CutPoint[] =>
        finite(point?.x) && finite(point?.y)
          ? [{ x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1) }]
          : [],
      ),
    ),
  );
  if (absolutePoints.length < 3 || polygonArea(absolutePoints) <= POINT_EPSILON)
    return null;
  const left = Math.min(...absolutePoints.map(({ x }) => x));
  const right = Math.max(...absolutePoints.map(({ x }) => x));
  const top = Math.min(...absolutePoints.map(({ y }) => y));
  const bottom = Math.max(...absolutePoints.map(({ y }) => y));
  const width = right - left;
  const height = bottom - top;
  if (width < MIN_CUT_REGION_SIZE || height < MIN_CUT_REGION_SIZE) return null;
  return sanitizeCutRegion({
    id: cleanId,
    shape: 'polygon',
    bounds: { x: left, y: top, w: width, h: height },
    points: absolutePoints.map(({ x, y }) => ({
      x: (x - left) / width,
      y: (y - top) / height,
    })),
    source,
  });
}

/** Translate a region by image-normalized deltas without letting it leave the source image. */
export function moveCutRegion(
  region: CutRegion,
  deltaX: number,
  deltaY: number,
): CutRegion {
  const bounds = sanitizeBounds(region.bounds);
  if (!bounds) return cloneRegion(region);
  const dx = finite(deltaX) ? deltaX : 0;
  const dy = finite(deltaY) ? deltaY : 0;
  return cloneRegion(region, {
    ...bounds,
    x: clamp(bounds.x + dx, 0, 1 - bounds.w),
    y: clamp(bounds.y + dy, 0, 1 - bounds.h),
  });
}

/**
 * Resize from any cardinal or corner handle. Deltas use full-image normalized
 * coordinates; the opposite edge stays fixed and polygon points remain relative.
 */
export function resizeCutRegion(
  region: CutRegion,
  handle: CutResizeHandle,
  deltaX: number,
  deltaY: number,
  minimumSize = MIN_CUT_REGION_SIZE,
): CutRegion {
  const bounds = sanitizeBounds(region.bounds);
  if (!bounds) return cloneRegion(region);
  const dx = finite(deltaX) ? deltaX : 0;
  const dy = finite(deltaY) ? deltaY : 0;
  const minSize = clamp(
    finite(minimumSize) ? minimumSize : MIN_CUT_REGION_SIZE,
    POINT_EPSILON,
    1,
  );
  let left = bounds.x;
  let right = bounds.x + bounds.w;
  let top = bounds.y;
  let bottom = bounds.y + bounds.h;

  if (handle.includes('w'))
    left = clamp(left + dx, 0, right - Math.min(minSize, right));
  if (handle.includes('e'))
    right = clamp(right + dx, left + Math.min(minSize, 1 - left), 1);
  if (handle.includes('n'))
    top = clamp(top + dy, 0, bottom - Math.min(minSize, bottom));
  if (handle.includes('s'))
    bottom = clamp(bottom + dy, top + Math.min(minSize, 1 - top), 1);

  return cloneRegion(region, {
    x: left,
    y: top,
    w: right - left,
    h: bottom - top,
  });
}

function safePathDimension(value: number) {
  return finite(value) && value > 0 ? value : 1;
}

function pathPoints(
  region: Pick<CutRegion, 'shape' | 'points'>,
  width: number,
  height: number,
) {
  const polygon =
    region.shape === 'polygon' ? sanitizeRelativePoints(region.points) : null;
  return polygon?.map(({ x, y }) => ({ x: x * width, y: y * height })) ?? [];
}

/**
 * Trace a mask path in coordinates local to the region's cropped pixel bounds.
 * Call beginPath before this helper, then clip or fill the resulting path.
 */
export function traceCutRegionPath(
  sink: CutPathSink,
  region: Pick<CutRegion, 'shape' | 'points'>,
  outputWidth: number,
  outputHeight: number,
) {
  const width = safePathDimension(outputWidth);
  const height = safePathDimension(outputHeight);
  if (region.shape === 'ellipse') {
    sink.ellipse(
      width / 2,
      height / 2,
      width / 2,
      height / 2,
      0,
      0,
      Math.PI * 2,
    );
  } else if (region.shape === 'heart') {
    sink.moveTo(width * 0.5, height);
    sink.bezierCurveTo(
      width * 0.42,
      height * 0.88,
      0,
      height * 0.62,
      0,
      height * 0.3,
    );
    sink.bezierCurveTo(
      0,
      height * 0.08,
      width * 0.25,
      0,
      width * 0.5,
      height * 0.22,
    );
    sink.bezierCurveTo(
      width * 0.75,
      0,
      width,
      height * 0.08,
      width,
      height * 0.3,
    );
    sink.bezierCurveTo(
      width,
      height * 0.62,
      width * 0.58,
      height * 0.88,
      width * 0.5,
      height,
    );
  } else if (region.shape === 'diamond') {
    sink.moveTo(width / 2, 0);
    sink.lineTo(width, height / 2);
    sink.lineTo(width / 2, height);
    sink.lineTo(0, height / 2);
  } else if (region.shape === 'polygon') {
    const points = pathPoints(region, width, height);
    if (!points.length) return;
    sink.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach(({ x, y }) => sink.lineTo(x, y));
  } else {
    sink.moveTo(0, 0);
    sink.lineTo(width, 0);
    sink.lineTo(width, height);
    sink.lineTo(0, height);
  }
  sink.closePath();
}

const pathNumber = (value: number) => Number(value.toFixed(4)).toString();

/** Return an SVG path in coordinates local to the region's cropped bounds. */
export function cutRegionSvgPath(
  region: Pick<CutRegion, 'shape' | 'points'>,
  outputWidth = 1,
  outputHeight = 1,
) {
  const width = safePathDimension(outputWidth);
  const height = safePathDimension(outputHeight);
  const n = pathNumber;
  if (region.shape === 'ellipse') {
    return `M ${n(width / 2)} 0 A ${n(width / 2)} ${n(height / 2)} 0 1 1 ${n(width / 2)} ${n(height)} A ${n(width / 2)} ${n(height / 2)} 0 1 1 ${n(width / 2)} 0 Z`;
  }
  if (region.shape === 'heart') {
    return `M ${n(width * 0.5)} ${n(height)} C ${n(width * 0.42)} ${n(height * 0.88)} 0 ${n(height * 0.62)} 0 ${n(height * 0.3)} C 0 ${n(height * 0.08)} ${n(width * 0.25)} 0 ${n(width * 0.5)} ${n(height * 0.22)} C ${n(width * 0.75)} 0 ${n(width)} ${n(height * 0.08)} ${n(width)} ${n(height * 0.3)} C ${n(width)} ${n(height * 0.62)} ${n(width * 0.58)} ${n(height * 0.88)} ${n(width * 0.5)} ${n(height)} Z`;
  }
  if (region.shape === 'diamond') {
    return `M ${n(width / 2)} 0 L ${n(width)} ${n(height / 2)} L ${n(width / 2)} ${n(height)} L 0 ${n(height / 2)} Z`;
  }
  if (region.shape === 'polygon') {
    const points = pathPoints(region, width, height);
    if (!points.length) return '';
    return `${points.map(({ x, y }, index) => `${index ? 'L' : 'M'} ${n(x)} ${n(y)}`).join(' ')} Z`;
  }
  return `M 0 0 L ${n(width)} 0 L ${n(width)} ${n(height)} L 0 ${n(height)} Z`;
}

/**
 * Converts a normalized cut rectangle into shared integer pixel boundaries.
 * Adjacent grid cells use the same rounded boundary, so no source row or
 * column can disappear between independently cropped pieces.
 */
export function cutPixelBounds(
  rect: CutRect,
  imageWidth: number,
  imageHeight: number,
): PixelCutBounds {
  const safeWidth = Math.max(1, Math.round(imageWidth));
  const safeHeight = Math.max(1, Math.round(imageHeight));
  const left = clamp(
    Math.round(clamp(rect.x, 0, 1) * safeWidth),
    0,
    safeWidth - 1,
  );
  const top = clamp(
    Math.round(clamp(rect.y, 0, 1) * safeHeight),
    0,
    safeHeight - 1,
  );
  const right = clamp(
    Math.round(clamp(rect.x + rect.w, 0, 1) * safeWidth),
    left + 1,
    safeWidth,
  );
  const bottom = clamp(
    Math.round(clamp(rect.y + rect.h, 0, 1) * safeHeight),
    top + 1,
    safeHeight,
  );
  return { x: left, y: top, width: right - left, height: bottom - top };
}
