import type { CutRegion } from './sheet-cuts.ts';

export const AI_CUTOUT_COORDINATE_SCALE = 10_000;
export const MAX_AI_CUTOUT_BRIEF_LENGTH = 1_200;
export const MAX_AI_CUTOUT_REGIONS = 40;
export const MAX_AI_CUTOUT_POLYGON_POINTS = 20;
export const MAX_AI_CUTOUT_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_AI_CUTOUT_ENCODED_CHARS =
  Math.ceil(MAX_AI_CUTOUT_IMAGE_BYTES / 3) * 4;
export const MAX_AI_CUTOUT_REQUEST_BYTES =
  MAX_AI_CUTOUT_ENCODED_CHARS + MAX_AI_CUTOUT_BRIEF_LENGTH * 4 + 4_096;

export const AI_CUTOUT_SHAPE_PREFERENCES = [
  'auto',
  'rectangle',
  'ellipse',
  'heart',
  'diamond',
  'polygon',
] as const;

export const AI_CUTOUT_REGION_SHAPES = [
  'rectangle',
  'ellipse',
  'heart',
  'diamond',
  'polygon',
] as const;

export const AI_CUTOUT_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export type AiCutoutShapePreference =
  (typeof AI_CUTOUT_SHAPE_PREFERENCES)[number];
export type AiCutoutRegionShape = (typeof AI_CUTOUT_REGION_SHAPES)[number];
export type AiCutoutImageMimeType = (typeof AI_CUTOUT_IMAGE_MIME_TYPES)[number];

export type AiCutoutRequest = {
  imageDataUrl: string;
  brief: string;
  shapePreference: AiCutoutShapePreference;
};

export type SanitizedAiCutoutRequest = AiCutoutRequest & {
  imageMimeType: AiCutoutImageMimeType;
  imageBytes: number;
};

export type AiCutoutBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AiCutoutPoint = {
  /** Coordinate relative to the region's bounding box. */
  x: number;
  /** Coordinate relative to the region's bounding box. */
  y: number;
};

export type AiCutoutRegion = {
  box: AiCutoutBox;
  shape: AiCutoutRegionShape;
  label: string;
  /** Integer confidence percentage in the inclusive range 0..100. */
  confidence: number;
  /** Present only for polygon regions; coordinates are relative to `box`. */
  points?: AiCutoutPoint[];
};

export type AiCutoutDecision = {
  version: 1;
  regions: AiCutoutRegion[];
};

export type AiCutoutRequestErrorCode =
  | 'invalid_request'
  | 'invalid_brief'
  | 'invalid_shape_preference'
  | 'invalid_image_data'
  | 'unsupported_image_type'
  | 'image_too_large';

export class AiCutoutRequestError extends Error {
  readonly code: AiCutoutRequestErrorCode;
  readonly status: 400 | 413 | 415;

  constructor(
    code: AiCutoutRequestErrorCode,
    message: string,
    status: 400 | 413 | 415 = 400,
  ) {
    super(message);
    this.name = 'AiCutoutRequestError';
    this.code = code;
    this.status = status;
  }
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const hasOnlyKeys = (value: UnknownRecord, allowed: readonly string[]) => {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
};
const isIntegerBetween = (
  value: unknown,
  min: number,
  max: number,
): value is number =>
  Number.isInteger(value) &&
  (value as number) >= min &&
  (value as number) <= max;
const isShapePreference = (value: unknown): value is AiCutoutShapePreference =>
  typeof value === 'string' &&
  AI_CUTOUT_SHAPE_PREFERENCES.includes(value as AiCutoutShapePreference);
const isRegionShape = (value: unknown): value is AiCutoutRegionShape =>
  typeof value === 'string' &&
  AI_CUTOUT_REGION_SHAPES.includes(value as AiCutoutRegionShape);

function base64ByteLength(payload: string) {
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return (payload.length / 4) * 3 - padding;
}

function imagePrefixBytes(payload: string) {
  try {
    const prefix = globalThis.atob(
      payload.slice(0, Math.min(payload.length, 24)),
    );
    return Array.from(prefix, (character) => character.charCodeAt(0));
  } catch {
    return [];
  }
}

function prefixMatchesMime(bytes: number[], mimeType: AiCutoutImageMimeType) {
  if (mimeType === 'image/png') {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (byte, index) => bytes[index] === byte,
    );
  }
  if (mimeType === 'image/jpeg')
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

function sanitizeImageDataUrl(value: unknown) {
  if (typeof value !== 'string' || !value) {
    throw new AiCutoutRequestError(
      'invalid_image_data',
      'Choose a PNG, JPEG, or WebP image for AI cutout detection.',
    );
  }
  if (value.length > MAX_AI_CUTOUT_ENCODED_CHARS + 64) {
    throw new AiCutoutRequestError(
      'image_too_large',
      `Prepare an image smaller than ${MAX_AI_CUTOUT_IMAGE_BYTES / 1024 / 1024} MB before using AI cutouts.`,
      413,
    );
  }
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(value);
  if (!match) {
    throw new AiCutoutRequestError(
      'invalid_image_data',
      'The image data is not a valid base64 data URL.',
    );
  }
  const mimeType = match[1].toLowerCase();
  if (!AI_CUTOUT_IMAGE_MIME_TYPES.includes(mimeType as AiCutoutImageMimeType)) {
    throw new AiCutoutRequestError(
      'unsupported_image_type',
      'AI cutouts support PNG, JPEG, and WebP images.',
      415,
    );
  }
  const payload = match[2];
  if (payload.length % 4 !== 0) {
    throw new AiCutoutRequestError(
      'invalid_image_data',
      'The image base64 payload is incomplete.',
    );
  }
  const imageBytes = base64ByteLength(payload);
  if (!Number.isSafeInteger(imageBytes) || imageBytes <= 0) {
    throw new AiCutoutRequestError(
      'invalid_image_data',
      'The image base64 payload is empty or invalid.',
    );
  }
  if (imageBytes > MAX_AI_CUTOUT_IMAGE_BYTES) {
    throw new AiCutoutRequestError(
      'image_too_large',
      `Prepare an image smaller than ${MAX_AI_CUTOUT_IMAGE_BYTES / 1024 / 1024} MB before using AI cutouts.`,
      413,
    );
  }
  const typedMime = mimeType as AiCutoutImageMimeType;
  if (!prefixMatchesMime(imagePrefixBytes(payload), typedMime)) {
    throw new AiCutoutRequestError(
      'invalid_image_data',
      `The image bytes do not match the declared ${typedMime.replace('image/', '').toUpperCase()} format.`,
    );
  }
  return {
    imageDataUrl: `data:${typedMime};base64,${payload}`,
    imageMimeType: typedMime,
    imageBytes,
  };
}

export function sanitizeAiCutoutRequest(
  value: unknown,
): SanitizedAiCutoutRequest {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['imageDataUrl', 'brief', 'shapePreference'])
  ) {
    throw new AiCutoutRequestError(
      'invalid_request',
      'The AI cutout request contains unsupported fields.',
    );
  }
  if (typeof value.brief !== 'string' || !value.brief.trim()) {
    throw new AiCutoutRequestError(
      'invalid_brief',
      'Describe which panels or subjects you want to cut out.',
    );
  }
  const brief = value.brief.trim();
  if (brief.length > MAX_AI_CUTOUT_BRIEF_LENGTH) {
    throw new AiCutoutRequestError(
      'invalid_brief',
      `Keep the AI cutout brief under ${MAX_AI_CUTOUT_BRIEF_LENGTH.toLocaleString()} characters.`,
    );
  }
  if (!isShapePreference(value.shapePreference)) {
    throw new AiCutoutRequestError(
      'invalid_shape_preference',
      'Choose Auto, Rectangle, Ellipse, Heart, Diamond, or Polygon for the cutout shape.',
    );
  }
  return {
    ...sanitizeImageDataUrl(value.imageDataUrl),
    brief,
    shapePreference: value.shapePreference,
  };
}

export const aiCutoutDecisionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'regions'],
  properties: {
    version: { type: 'integer', enum: [1] },
    regions: {
      type: 'array',
      minItems: 1,
      maxItems: MAX_AI_CUTOUT_REGIONS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['box', 'shape', 'label', 'confidence', 'points'],
        properties: {
          box: {
            type: 'object',
            additionalProperties: false,
            required: ['x', 'y', 'width', 'height'],
            properties: {
              x: {
                type: 'integer',
                minimum: 0,
                maximum: AI_CUTOUT_COORDINATE_SCALE - 1,
              },
              y: {
                type: 'integer',
                minimum: 0,
                maximum: AI_CUTOUT_COORDINATE_SCALE - 1,
              },
              width: {
                type: 'integer',
                minimum: 1,
                maximum: AI_CUTOUT_COORDINATE_SCALE,
              },
              height: {
                type: 'integer',
                minimum: 1,
                maximum: AI_CUTOUT_COORDINATE_SCALE,
              },
            },
          },
          shape: { type: 'string', enum: AI_CUTOUT_REGION_SHAPES },
          label: { type: 'string', minLength: 1, maxLength: 80 },
          confidence: { type: 'integer', minimum: 0, maximum: 100 },
          // Strict Structured Outputs requires all object properties. The model
          // returns [] for non-polygons; the parser makes `points` optional.
          points: {
            type: 'array',
            minItems: 0,
            maxItems: MAX_AI_CUTOUT_POLYGON_POINTS,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['x', 'y'],
              properties: {
                x: {
                  type: 'integer',
                  minimum: 0,
                  maximum: AI_CUTOUT_COORDINATE_SCALE,
                },
                y: {
                  type: 'integer',
                  minimum: 0,
                  maximum: AI_CUTOUT_COORDINATE_SCALE,
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

function parseBox(value: unknown): AiCutoutBox {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['x', 'y', 'width', 'height']) ||
    !isIntegerBetween(value.x, 0, AI_CUTOUT_COORDINATE_SCALE - 1) ||
    !isIntegerBetween(value.y, 0, AI_CUTOUT_COORDINATE_SCALE - 1) ||
    !isIntegerBetween(value.width, 1, AI_CUTOUT_COORDINATE_SCALE) ||
    !isIntegerBetween(value.height, 1, AI_CUTOUT_COORDINATE_SCALE) ||
    value.x + value.width > AI_CUTOUT_COORDINATE_SCALE ||
    value.y + value.height > AI_CUTOUT_COORDINATE_SCALE
  ) {
    throw new Error(
      'An AI cutout bounding box extends outside the source image.',
    );
  }
  return { x: value.x, y: value.y, width: value.width, height: value.height };
}

function parsePoint(value: unknown): AiCutoutPoint {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['x', 'y']) ||
    !isIntegerBetween(value.x, 0, AI_CUTOUT_COORDINATE_SCALE) ||
    !isIntegerBetween(value.y, 0, AI_CUTOUT_COORDINATE_SCALE)
  ) {
    throw new Error('An AI cutout polygon point is invalid.');
  }
  return { x: value.x, y: value.y };
}

function polygonAreaTwice(points: readonly AiCutoutPoint[]) {
  return Math.abs(
    points.reduce((area, point, index) => {
      const next = points[(index + 1) % points.length];
      return area + point.x * next.y - next.x * point.y;
    }, 0),
  );
}

function parseRegion(value: unknown): AiCutoutRegion {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['box', 'shape', 'label', 'confidence', 'points']) ||
    !isRegionShape(value.shape) ||
    typeof value.label !== 'string' ||
    !value.label.trim() ||
    value.label.length > 80 ||
    !isIntegerBetween(value.confidence, 0, 100)
  ) {
    throw new Error('The AI returned an invalid cutout proposal.');
  }
  const box = parseBox(value.box);
  if (value.points !== undefined && !Array.isArray(value.points)) {
    throw new Error('The AI returned invalid cutout points.');
  }
  const points = (value.points ?? []).map(parsePoint);
  if (value.shape === 'polygon') {
    if (
      points.length < 3 ||
      points.length > MAX_AI_CUTOUT_POLYGON_POINTS ||
      new Set(points.map(({ x, y }) => `${x}:${y}`)).size < 3 ||
      polygonAreaTwice(points) === 0
    ) {
      throw new Error(
        `An AI polygon must have 3 to ${MAX_AI_CUTOUT_POLYGON_POINTS} distinct, non-collinear points.`,
      );
    }
  } else if (points.length !== 0) {
    throw new Error('Only polygon cutouts may include polygon points.');
  }
  return {
    box,
    shape: value.shape,
    label: value.label.trim(),
    confidence: value.confidence,
    ...(points.length ? { points } : {}),
  };
}

export function parseAiCutoutDecision(value: unknown): AiCutoutDecision {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['version', 'regions']) ||
    value.version !== 1 ||
    !Array.isArray(value.regions) ||
    value.regions.length < 1 ||
    value.regions.length > MAX_AI_CUTOUT_REGIONS
  ) {
    throw new Error(
      `AI must return between 1 and ${MAX_AI_CUTOUT_REGIONS} cutout proposals.`,
    );
  }
  const seenBoxes = new Set<string>();
  const regions = value.regions.map(parseRegion).filter(({ box }) => {
    const key = `${box.x}:${box.y}:${box.width}:${box.height}`;
    if (seenBoxes.has(key)) return false;
    seenBoxes.add(key);
    return true;
  });
  return { version: 1, regions };
}

export type AiCutoutMappedRegion = {
  rect: { x: number; y: number; w: number; h: number };
  /** Absolute 0..1 source-image points, present only for polygon regions. */
  polygon?: Array<{ x: number; y: number }>;
};

/** Convert the integer wire format into the editor's normalized crop geometry. */
export function mapAiCutoutRegion(
  region: AiCutoutRegion,
): AiCutoutMappedRegion {
  const rect = {
    x: region.box.x / AI_CUTOUT_COORDINATE_SCALE,
    y: region.box.y / AI_CUTOUT_COORDINATE_SCALE,
    w: region.box.width / AI_CUTOUT_COORDINATE_SCALE,
    h: region.box.height / AI_CUTOUT_COORDINATE_SCALE,
  };
  const polygon = region.points?.map((point) => ({
    x:
      (region.box.x +
        (region.box.width * point.x) / AI_CUTOUT_COORDINATE_SCALE) /
      AI_CUTOUT_COORDINATE_SCALE,
    y:
      (region.box.y +
        (region.box.height * point.y) / AI_CUTOUT_COORDINATE_SCALE) /
      AI_CUTOUT_COORDINATE_SCALE,
  }));
  return { rect, ...(polygon ? { polygon } : {}) };
}

/** Map a proposal directly into the editor's caller-identified region model. */
export function mapAiCutoutRegionToCutRegion(
  region: AiCutoutRegion,
  id: string,
): CutRegion {
  const { rect } = mapAiCutoutRegion(region);
  const points = region.points?.map(({ x, y }) => ({
    x: x / AI_CUTOUT_COORDINATE_SCALE,
    y: y / AI_CUTOUT_COORDINATE_SCALE,
  }));
  return {
    id,
    shape: region.shape,
    bounds: rect,
    ...(points ? { points } : {}),
    source: 'ai-vision',
  };
}
