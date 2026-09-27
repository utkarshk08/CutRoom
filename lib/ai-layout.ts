export const AI_COORDINATE_SCALE = 10_000;
export const MAX_AI_BRIEF_LENGTH = 1_200;
export const MAX_AI_UNITS = 300;
/** @deprecated Use MAX_AI_UNITS. */
export const MAX_AI_PIECES = MAX_AI_UNITS;

export type AiTone = 'pastel' | 'warm' | 'cool' | 'dark' | 'neutral';

/**
 * A unit is the smallest rigid object the arranger may move. An individual
 * photo is one unit; an explicit wall/print group is collapsed into one unit.
 * The browser keeps the unit-to-member binding private and sends only this
 * short request-local ID to the server.
 */
export type AiLayoutUnit = {
  id: string;
  code: string;
  name: string;
  kind: 'photo' | 'text' | 'group';
  memberCount: number;
  movable: boolean;
  /** Axis-aligned visual envelope, including rotations and group spacing. */
  footprintWidthCm: number;
  footprintHeightCm: number;
  footprintAreaCm2: number;
  /** Current envelope centre in independently normalized wall coordinates. */
  x: number;
  y: number;
  /** Visible labels only; member identities remain in the browser binding. */
  memberCodes: string[];
  categories: string[];
  tones: AiTone[];
};

export type AiLayoutRequest = {
  version: 1;
  brief: string;
  wall: { widthCm: number; heightCm: number };
  density: number;
  groupStrength: number;
  units: AiLayoutUnit[];
};

export type AiLayoutPlacement = {
  id: string;
  /** Target centre in the inclusive range 0..AI_COORDINATE_SCALE. */
  x: number;
  y: number;
};

export type AiLayoutDecision = {
  version: 1;
  name: string;
  rationale: string;
  placements: AiLayoutPlacement[];
};

type UnknownRecord = Record<string, unknown>;

const TONES: readonly AiTone[] = ['pastel', 'warm', 'cool', 'dark', 'neutral'];
const UNIT_ID = /^[A-Za-z0-9_-]{1,48}$/;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const clampInteger = (value: number, min: number, max: number) =>
  Math.round(clamp(value, min, max));
const cleanText = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
const cleanTone = (value: unknown): AiTone | undefined =>
  TONES.includes(value as AiTone) ? (value as AiTone) : undefined;

function sanitizeStringList(
  value: unknown,
  maxItems: number,
  maxLength: number,
  fallback: string,
) {
  const result = (Array.isArray(value) ? value : [])
    .flatMap((entry) => {
      const valueText = cleanText(entry, maxLength);
      return valueText ? [valueText] : [];
    })
    .filter((entry, index, all) => all.indexOf(entry) === index)
    .slice(0, maxItems);
  return result.length ? result : [fallback];
}

function sanitizeUnit(value: unknown): AiLayoutUnit {
  if (!isRecord(value)) throw new Error('An AI layout unit is invalid.');
  const id = cleanText(value.id, 48);
  if (!UNIT_ID.test(id)) throw new Error('An AI layout unit ID is invalid.');
  if (
    !finite(value.footprintWidthCm) ||
    !finite(value.footprintHeightCm) ||
    value.footprintWidthCm <= 0 ||
    value.footprintHeightCm <= 0
  ) {
    throw new Error(`The dimensions for AI layout unit ${id} are invalid.`);
  }
  if (!finite(value.x) || !finite(value.y)) {
    throw new Error(`The position for AI layout unit ${id} is invalid.`);
  }
  const kind =
    value.kind === 'group' || value.kind === 'text' ? value.kind : 'photo';
  const code = cleanText(value.code, 48) || id;
  const footprintWidthCm = clamp(value.footprintWidthCm, 0.01, 10_000);
  const footprintHeightCm = clamp(value.footprintHeightCm, 0.01, 10_000);
  const tones = (Array.isArray(value.tones) ? value.tones : [])
    .flatMap((tone) => {
      const clean = cleanTone(tone);
      return clean ? [clean] : [];
    })
    .filter((tone, index, all) => all.indexOf(tone) === index)
    .slice(0, TONES.length);
  return {
    id,
    code,
    name:
      cleanText(value.name, 120) ||
      (kind === 'group' ? 'Grouped wall items' : 'Untitled'),
    kind,
    memberCount: finite(value.memberCount)
      ? clampInteger(value.memberCount, 1, MAX_AI_UNITS)
      : 1,
    movable: value.movable === true,
    footprintWidthCm,
    footprintHeightCm,
    // Derive rather than trust a caller-provided area used for size ordering.
    footprintAreaCm2:
      Math.round(footprintWidthCm * footprintHeightCm * 100) / 100,
    x: clampInteger(value.x, 0, AI_COORDINATE_SCALE),
    y: clampInteger(value.y, 0, AI_COORDINATE_SCALE),
    memberCodes: sanitizeStringList(value.memberCodes, MAX_AI_UNITS, 48, code),
    categories: sanitizeStringList(value.categories, 6, 80, 'Unsorted'),
    tones: tones.length ? tones : ['neutral'],
  };
}

export function sanitizeAiLayoutRequest(value: unknown): AiLayoutRequest {
  if (!isRecord(value)) throw new Error('The AI layout request is invalid.');
  const brief = cleanText(value.brief, MAX_AI_BRIEF_LENGTH);
  if (!brief) throw new Error('Describe how you want the wall to feel first.');
  if (
    !isRecord(value.wall) ||
    !finite(value.wall.widthCm) ||
    !finite(value.wall.heightCm)
  ) {
    throw new Error('The wall dimensions are invalid.');
  }
  if (!Array.isArray(value.units) || value.units.length === 0) {
    throw new Error(
      'Place at least one photo on the wall before asking AI to arrange it.',
    );
  }
  if (value.units.length > MAX_AI_UNITS) {
    throw new Error(
      `AI can arrange at most ${MAX_AI_UNITS} wall units at once.`,
    );
  }
  const units = value.units.map(sanitizeUnit);
  if (new Set(units.map(({ id }) => id)).size !== units.length) {
    throw new Error('AI layout unit IDs must be unique.');
  }
  if (!units.some(({ movable, kind }) => movable && kind !== 'text')) {
    throw new Error(
      'Place at least one unlocked photo or group on the wall before asking AI to arrange it.',
    );
  }
  return {
    version: 1,
    brief,
    wall: {
      widthCm: clamp(value.wall.widthCm, 1, 10_000),
      heightCm: clamp(value.wall.heightCm, 1, 10_000),
    },
    density: finite(value.density) ? clampInteger(value.density, 20, 95) : 62,
    groupStrength: finite(value.groupStrength)
      ? clampInteger(value.groupStrength, 0, 100)
      : 65,
    units,
  };
}

export function movableAiUnitIds(request: Pick<AiLayoutRequest, 'units'>) {
  return request.units.filter(({ movable }) => movable).map(({ id }) => id);
}

/** Build the strict schema after sanitizing the request so IDs are bounded. */
export function aiLayoutDecisionSchema(expectedIds: readonly string[]) {
  if (
    expectedIds.length === 0 ||
    expectedIds.length > MAX_AI_UNITS ||
    new Set(expectedIds).size !== expectedIds.length ||
    expectedIds.some((id) => !UNIT_ID.test(id))
  ) {
    throw new Error('The expected AI layout IDs are invalid.');
  }
  return {
    type: 'object',
    additionalProperties: false,
    required: ['version', 'name', 'rationale', 'placements'],
    properties: {
      version: { type: 'integer', enum: [1] },
      name: { type: 'string', minLength: 1, maxLength: 80 },
      rationale: { type: 'string', minLength: 1, maxLength: 400 },
      placements: {
        type: 'array',
        minItems: expectedIds.length,
        maxItems: expectedIds.length,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'x', 'y'],
          properties: {
            id: { type: 'string', enum: [...expectedIds] },
            x: { type: 'integer', minimum: 0, maximum: AI_COORDINATE_SCALE },
            y: { type: 'integer', minimum: 0, maximum: AI_COORDINATE_SCALE },
          },
        },
      },
    },
  } as const;
}

function hasOnlyKeys(value: UnknownRecord, allowed: readonly string[]) {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

/**
 * Validate both shape and exact request coverage. JSON Schema cannot express
 * uniqueness by an object's `id`, so this contextual check is mandatory.
 */
export function parseAiLayoutDecision(
  value: unknown,
  expected: Pick<AiLayoutRequest, 'units'> | readonly string[],
): AiLayoutDecision {
  const expectedIds = Array.isArray(expected)
    ? [...expected]
    : movableAiUnitIds(expected as Pick<AiLayoutRequest, 'units'>);
  if (
    !expectedIds.length ||
    expectedIds.length > MAX_AI_UNITS ||
    new Set(expectedIds).size !== expectedIds.length ||
    expectedIds.some((id) => !UNIT_ID.test(id))
  ) {
    throw new Error('The expected AI layout IDs are invalid.');
  }
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['version', 'name', 'rationale', 'placements']) ||
    value.version !== 1 ||
    !Array.isArray(value.placements)
  ) {
    throw new Error('The AI returned an invalid composition.');
  }
  const name = cleanText(value.name, 80);
  const rationale = cleanText(value.rationale, 400);
  if (!name || !rationale || value.placements.length !== expectedIds.length) {
    throw new Error('The AI returned an incomplete composition.');
  }

  const expectedSet = new Set(expectedIds);
  const seen = new Set<string>();
  const byId = new Map<string, AiLayoutPlacement>();
  for (const raw of value.placements) {
    if (
      !isRecord(raw) ||
      !hasOnlyKeys(raw, ['id', 'x', 'y']) ||
      typeof raw.id !== 'string' ||
      !expectedSet.has(raw.id) ||
      seen.has(raw.id) ||
      !Number.isInteger(raw.x) ||
      !Number.isInteger(raw.y) ||
      (raw.x as number) < 0 ||
      (raw.x as number) > AI_COORDINATE_SCALE ||
      (raw.y as number) < 0 ||
      (raw.y as number) > AI_COORDINATE_SCALE
    ) {
      throw new Error(
        'The AI returned invalid or duplicate wall-unit positions.',
      );
    }
    seen.add(raw.id);
    byId.set(raw.id, { id: raw.id, x: raw.x as number, y: raw.y as number });
  }
  if (seen.size !== expectedSet.size) {
    throw new Error(
      'The AI did not position every movable wall unit exactly once.',
    );
  }

  return {
    version: 1,
    name,
    rationale,
    placements: expectedIds.map((id) => byId.get(id)!),
  };
}

type ShapeName =
  | 'ladder'
  | 'heart'
  | 'wave'
  | 'diamond'
  | 'circle'
  | 'arc'
  | 'spiral';
type Target = { x: number; y: number };

function requestedFallbackShape(brief: string): ShapeName | undefined {
  const lower = brief.toLowerCase();
  if (/\bspiral\b|\bswirl\b/.test(lower)) return 'spiral';
  if (/\bheart\b/.test(lower)) return 'heart';
  if (/\bwave\b|\bwavy\b|\bsine\b/.test(lower)) return 'wave';
  if (/\bladder\b|\bstair(?:s|case)?\b|\bsteps?\b/.test(lower)) return 'ladder';
  if (/\bdiamond\b|\brhombus\b/.test(lower)) return 'diamond';
  if (/\bcircle\b|\bcircular\b|\bring\b/.test(lower)) return 'circle';
  if (/\barc\b|\barch\b|\bcrescent\b/.test(lower)) return 'arc';
  return undefined;
}

function pointOnDiamond(progress: number): Target {
  const edge = progress * 4;
  if (edge < 1) return { x: 5_000 + 3_700 * edge, y: 1_200 + 3_800 * edge };
  if (edge < 2)
    return { x: 8_700 - 3_700 * (edge - 1), y: 5_000 + 3_800 * (edge - 1) };
  if (edge < 3)
    return { x: 5_000 - 3_700 * (edge - 2), y: 8_800 - 3_800 * (edge - 2) };
  return { x: 1_300 + 3_700 * (edge - 3), y: 5_000 - 3_800 * (edge - 3) };
}

function shapeTargets(
  shape: ShapeName,
  count: number,
  brief: string,
): Target[] {
  if (count <= 0) return [];
  if (count === 1) return [{ x: 5_000, y: 5_000 }];
  const lower = brief.toLowerCase();
  return Array.from({ length: count }, (_, index) => {
    const progress = index / (count - 1);
    if (shape === 'ladder') {
      const onLeft = /\bleft(?:[ -]side)?\b/.test(lower);
      const onRight = /\bright(?:[ -]side)?\b/.test(lower);
      const startX = onLeft ? 1_300 : onRight ? 5_700 : 1_500;
      const width = onLeft || onRight ? 3_000 : 7_000;
      return { x: startX + width * progress, y: 1_400 + 7_200 * progress };
    }
    if (shape === 'heart') {
      const angle = (index / count) * Math.PI * 2;
      const heartX = 16 * Math.sin(angle) ** 3;
      const heartY =
        13 * Math.cos(angle) -
        5 * Math.cos(2 * angle) -
        2 * Math.cos(3 * angle) -
        Math.cos(4 * angle);
      return { x: 5_000 + heartX * 230, y: 5_100 - heartY * 220 };
    }
    if (shape === 'wave') {
      const cycles = count > 18 ? 2 : 1.25;
      return {
        x: 1_000 + 8_000 * progress,
        y: 5_000 + 2_250 * Math.sin(progress * Math.PI * 2 * cycles),
      };
    }
    if (shape === 'diamond') return pointOnDiamond(index / count);
    if (shape === 'circle') {
      const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
      return {
        x: 5_000 + 3_650 * Math.cos(angle),
        y: 5_000 + 3_650 * Math.sin(angle),
      };
    }
    if (shape === 'arc') {
      const angle = Math.PI * progress;
      return {
        x: 1_150 + 7_700 * progress,
        y: 7_200 - 4_500 * Math.sin(angle),
      };
    }
    const angle = progress * Math.PI * 4.5 - Math.PI / 2;
    const radius = 350 + 3_700 * progress;
    return {
      x: 5_000 + radius * Math.cos(angle),
      y: 5_000 + radius * Math.sin(angle),
    };
  });
}

function clampTargetToWall(
  target: Target,
  unit: AiLayoutUnit,
  request: AiLayoutRequest,
): Target {
  const gapCm = request.density < 45 ? 2 : request.density > 75 ? 0.8 : 1.2;
  const halfX =
    ((unit.footprintWidthCm / 2 + gapCm / 2) / request.wall.widthCm) *
    AI_COORDINATE_SCALE;
  const halfY =
    ((unit.footprintHeightCm / 2 + gapCm / 2) / request.wall.heightCm) *
    AI_COORDINATE_SCALE;
  const minX = Math.min(AI_COORDINATE_SCALE / 2, halfX);
  const maxX = Math.max(AI_COORDINATE_SCALE / 2, AI_COORDINATE_SCALE - halfX);
  const minY = Math.min(AI_COORDINATE_SCALE / 2, halfY);
  const maxY = Math.max(AI_COORDINATE_SCALE / 2, AI_COORDINATE_SCALE - halfY);
  return {
    x: clampInteger(target.x, minX, maxX),
    y: clampInteger(target.y, minY, maxY),
  };
}

/**
 * A deterministic, private fallback for a small vocabulary of geometric
 * briefs. Unknown briefs are an honest no-op instead of an unrelated preset.
 */
export function localLayoutDecision(
  request: AiLayoutRequest,
): AiLayoutDecision {
  const safeRequest = sanitizeAiLayoutRequest(request);
  const shape = requestedFallbackShape(safeRequest.brief);
  const movable = safeRequest.units.filter(({ movable }) => movable);
  const ordered =
    shape === 'ladder'
      ? [...movable].sort(
          (a, b) =>
            a.footprintAreaCm2 - b.footprintAreaCm2 || a.id.localeCompare(b.id),
        )
      : movable;
  const targets = shape
    ? shapeTargets(shape, ordered.length, safeRequest.brief)
    : ordered.map(({ x, y }) => ({ x, y }));
  const byId = new Map(
    ordered.map((unit, index) => [
      unit.id,
      shape
        ? clampTargetToWall(targets[index], unit, safeRequest)
        : targets[index],
    ]),
  );
  const placements = movable.map(({ id }) => ({ id, ...byId.get(id)! }));

  return {
    version: 1,
    name: shape ? `Local ${shape}` : 'Keep current arrangement',
    rationale: shape
      ? `The private local fallback recognized a ${shape} request and generated rigid target centres. Exact sizes, rotations, text styling, locked items, and grouped internal spacing stay unchanged.`
      : 'The secure AI connection was unavailable and the brief did not match a safe local geometric fallback, so the current arrangement was kept unchanged.',
    placements,
  };
}
