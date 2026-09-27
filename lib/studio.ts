import { isQuarterTurn, type PrintSheetRotation } from './print-rotation.ts';
import type { PhotoBorder } from './photo-border.ts';
import type { TextPieceData } from './text-elements.ts';

export type LayoutName = 'salon' | 'organic' | 'strip' | 'diamond' | 'flow' | 'compass';

export type PhotoCrop = {
  mode: 'fill' | 'fit';
  zoom: number;
  offsetX: number;
  offsetY: number;
  quarterTurns: 0 | 1 | 2 | 3;
  flipX: boolean;
  flipY: boolean;
};

export type Piece = {
  /** Immutable internal key. Never show this value to the user. */
  id: string;
  /** Stable, human-readable label used on the wall, exports, and print sheets. */
  code: string;
  name: string;
  src: string;
  sourceName?: string;
  widthCm: number;
  heightCm: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  placed: boolean;
  locked: boolean;
  category: string;
  tone: 'pastel' | 'warm' | 'cool' | 'dark' | 'neutral';
  color: string;
  sizeMode?: 'paper' | 'original' | 'custom';
  pixelW?: number;
  pixelH?: number;
  zIndex?: number;
  crop?: PhotoCrop;
  /** Omitted on older projects; all existing pieces are photos. */
  kind?: 'photo' | 'text';
  text?: TextPieceData;
  /** Drawn inside the physical photo rectangle, so packing dimensions never change. */
  border?: PhotoBorder;
};

export type Wall = {
  widthCm: number;
  heightCm: number;
  color: string;
  photo?: string;
  /** Opacity of the uploaded/fallback room photo. 0 hides it completely. */
  photoOpacity: number;
  furnitureClearanceCm: number;
};

export type PrintGroup = {
  /** Immutable internal key used by Print Pack overrides. */
  id: string;
  /** Stable, human-readable group label. */
  code: string;
  /** Member order is normalized from the wall's layer order at render time. */
  memberIds: string[];
};

export type LayoutTarget = {
  unitId: string;
  centerXPercent: number;
  centerYPercent: number;
};

export type LayoutUnit = {
  /** Group ID or single-piece ID. This stays internal to the browser. */
  id: string;
  code: string;
  name: string;
  kind: 'photo' | 'text' | 'group';
  memberIds: string[];
  memberCodes: string[];
  members: Piece[];
  proxy: Piece;
  hasPhoto: boolean;
  locked: boolean;
  categories: string[];
  tones: Piece['tone'][];
};

export type PrintPackItem = {
  instanceId: string;
  pieceId: string;
  widthCm: number;
  heightCm: number;
  order: number;
  /** Undefined lets Smart Rotation decide; a number is an explicit per-photo choice. */
  rotationPreference?: PrintSheetRotation;
};

export type PrintPlacement = PrintPackItem & {
  xCm: number;
  yCm: number;
  /** Print-pack-only rotation. The wall angle and crop orientation stay untouched. */
  sheetRotation: PrintSheetRotation;
};

export type PrintPackOptions = {
  allow90Rotation?: boolean;
};

export function printPlacementFootprint(placement: Pick<PrintPlacement, 'widthCm' | 'heightCm' | 'sheetRotation'>) {
  return isQuarterTurn(placement.sheetRotation)
    ? { widthCm: placement.heightCm, heightCm: placement.widthCm }
    : { widthCm: placement.widthCm, heightCm: placement.heightCm };
}

export type PrintPackPage = {
  placements: PrintPlacement[];
  usedAreaCm2: number;
};

export type PrintPackResult = {
  pages: PrintPackPage[];
  unplaced: PrintPackItem[];
  totalAreaCm2: number;
  sparePercent: number;
};

export type PrintFitRecommendation = {
  widthCm: number;
  heightCm: number;
  scale: number;
  sheetRotation: PrintSheetRotation;
};

/**
 * Return the largest proportional version of an item that fits the usable
 * sheet. Explicit rotations are respected; Auto may compare 0° and 90°.
 */
export function recommendPrintFit(
  item: Pick<PrintPackItem, 'widthCm' | 'heightCm' | 'rotationPreference'>,
  sheetWidthCm: number,
  sheetHeightCm: number,
  marginCm: number,
  allow90Rotation: boolean,
): PrintFitRecommendation {
  const usableWidth = Math.max(0.01, sheetWidthCm - Math.max(0, marginCm) * 2);
  const usableHeight = Math.max(0.01, sheetHeightCm - Math.max(0, marginCm) * 2);
  const rotations: PrintSheetRotation[] = item.rotationPreference !== undefined
    ? [item.rotationPreference]
    : allow90Rotation ? [0, 90] : [0];
  const candidates = rotations.map((sheetRotation) => {
    const quarterTurn = isQuarterTurn(sheetRotation);
    const footprintWidth = quarterTurn ? item.heightCm : item.widthCm;
    const footprintHeight = quarterTurn ? item.widthCm : item.heightCm;
    const scale = Math.min(1, usableWidth / Math.max(0.01, footprintWidth), usableHeight / Math.max(0.01, footprintHeight));
    return {
      widthCm: item.widthCm * scale,
      heightCm: item.heightCm * scale,
      scale,
      sheetRotation,
    };
  });
  return candidates.sort((a, b) => b.scale - a.scale || Math.abs(a.sheetRotation) - Math.abs(b.sheetRotation))[0];
}

export const PAPER_SIZES = {
  A6: [10.5, 14.8],
  A5: [14.8, 21],
  A4: [21, 29.7],
  A3: [29.7, 42],
  A2: [42, 59.4],
  A1: [59.4, 84.1],
} as const;

export const DEMO_PIECES: Piece[] = [
  { id: 'demo-s01-01', code: 'S01-01', name: 'Friends together', src: '/demo/cuts/friends-group.png', widthCm: 9.9, heightCm: 14.1, x: 11, y: 18, w: 10, h: 22, rotation: -0.5, placed: true, locked: false, category: 'Friends', tone: 'pastel', color: '#b494f3' },
  { id: 'demo-s01-02', code: 'S01-02', name: 'Yellow frame', src: '/demo/cuts/friends-frame.png', widthCm: 9.9, heightCm: 14.1, x: 23, y: 13, w: 10, h: 22, rotation: 0, placed: true, locked: false, category: 'Friends', tone: 'pastel', color: '#8c6fd8' },
  { id: 'demo-s01-04', code: 'S01-04', name: 'Phoebe', src: '/demo/cuts/phoebe.png', widthCm: 9.9, heightCm: 14.1, x: 35, y: 18, w: 10, h: 22, rotation: 0, placed: true, locked: false, category: 'Friends', tone: 'neutral', color: '#e2c79f' },
  { id: 'demo-s01-05', code: 'S01-05', name: 'Chandler', src: '/demo/cuts/chandler.png', widthCm: 9.9, heightCm: 14.1, x: 47, y: 10, w: 10, h: 22, rotation: 0, placed: true, locked: false, category: 'Friends', tone: 'pastel', color: '#c7a0de' },
  { id: 'demo-s09-01', code: 'S09-01', name: 'Pirates', src: '/demo/cuts/pirates.png', widthCm: 9.9, heightCm: 16.1, x: 59, y: 16, w: 10, h: 25, rotation: 0.4, placed: true, locked: false, category: 'Adventure', tone: 'warm', color: '#af6a35' },
  { id: 'demo-s09-03', code: 'S09-03', name: 'La La Land', src: '/demo/cuts/lalaland.png', widthCm: 9.9, heightCm: 16.1, x: 71, y: 13, w: 10, h: 25, rotation: 0, placed: true, locked: false, category: 'Cinema', tone: 'pastel', color: '#766ad4' },
  { id: 'demo-s09-06', code: 'S09-06', name: 'Jon Snow', src: '/demo/cuts/jonsnow.png', widthCm: 9.9, heightCm: 15.8, x: 16, y: 48, w: 10, h: 24, rotation: 0, placed: true, locked: false, category: 'Fantasy', tone: 'cool', color: '#55768b' },
  { id: 'demo-s09-08', code: 'S09-08', name: 'Squid Game', src: '/demo/cuts/squid.png', widthCm: 9.9, heightCm: 15.8, x: 28, y: 46, w: 10, h: 24, rotation: -0.3, placed: true, locked: false, category: 'Thriller', tone: 'dark', color: '#bc2846' },
  { id: 'demo-s04-01', code: 'S04-01', name: 'G.O.A.T.', src: '/demo/cuts/goat.png', widthCm: 19.8, heightCm: 37.5, x: 42, y: 39, w: 16, h: 38, rotation: 0, placed: true, locked: true, category: 'Personal', tone: 'cool', color: '#5689b6' },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const aspect = (piece: Piece) => piece.widthCm / piece.heightCm;

function withSlot(piece: Piece, x: number, y: number, w: number, h: number): Piece {
  return { ...piece, x: clamp(x, 1, 98 - w), y: clamp(y, 1, 98 - h), w, h, placed: true, rotation: 0 };
}

function fitRows(items: Piece[], wall: Wall, density: number, startY = 8, height = 78): Piece[] {
  if (!items.length) return [];
  const columns = Math.max(2, Math.ceil(Math.sqrt(items.length * (wall.widthCm / wall.heightCm))));
  const rows = Math.ceil(items.length / columns);
  const gap = 1.5 + (100 - density) * 0.025;
  const rowBox = height / rows;
  const result: Piece[] = [];

  for (let row = 0; row < rows; row += 1) {
    const rowItems = items.slice(row * columns, (row + 1) * columns);
    const desiredH = rowBox * 0.72;
    const rawWidths = rowItems.map((item) => desiredH * aspect(item) * (wall.heightCm / wall.widthCm));
    const scale = Math.min(1, (88 - gap * Math.max(0, rowItems.length - 1)) / Math.max(1, rawWidths.reduce((a, b) => a + b, 0)));
    const widths = rawWidths.map((width) => width * scale);
    const totalWidth = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, rowItems.length - 1);
    let cursor = (100 - totalWidth) / 2;
    rowItems.forEach((item, index) => {
      const w = widths[index];
      const h = (w / aspect(item)) * (wall.widthCm / wall.heightCm);
      result.push(withSlot(item, cursor, startY + row * rowBox + (rowBox - h) / 2, w, h));
      cursor += w + gap;
    });
  }
  return result;
}

function masonry(items: Piece[], wall: Wall, density: number): Piece[] {
  if (!items.length) return [];
  const columns = Math.max(3, Math.min(7, Math.round(Math.sqrt(items.length * 1.4))));
  const gap = 1.2 + (100 - density) * 0.022;
  const width = (88 - gap * (columns - 1)) / columns;
  const heights = Array.from({ length: columns }, () => 6);
  const result = items.map((item) => {
    const col = heights.indexOf(Math.min(...heights));
    const h = (width / aspect(item)) * (wall.widthCm / wall.heightCm);
    const placed = withSlot(item, 6 + col * (width + gap), heights[col], width, h);
    heights[col] += h + gap;
    return placed;
  });
  const maxY = Math.max(...result.map((item) => item.y + item.h));
  if (maxY <= 94) return result;
  const scale = 88 / (maxY - 6);
  return result.map((item) => withSlot(item, 50 + (item.x - 50) * scale, 6 + (item.y - 6) * scale, item.w * scale, item.h * scale));
}

function filmStrip(items: Piece[], wall: Wall, density: number): Piece[] {
  if (!items.length) return [];
  const rows = Math.min(3, Math.ceil(items.length / 3));
  const perRow = Math.ceil(items.length / rows);
  const gap = 1.1 + (100 - density) * 0.018;
  const result: Piece[] = [];
  for (let row = 0; row < rows; row += 1) {
    const rowItems = items.slice(row * perRow, (row + 1) * perRow);
    let targetH = 24;
    let widths = rowItems.map((item) => targetH * aspect(item) * (wall.heightCm / wall.widthCm));
    const total = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, rowItems.length - 1);
    if (total > 90) {
      const scale = 90 / total;
      targetH *= scale;
      widths = widths.map((width) => width * scale);
    }
    const actualTotal = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, rowItems.length - 1);
    let cursor = row % 2 === 0 ? 5 : Math.max(5, 95 - actualTotal);
    rowItems.forEach((item, index) => {
      result.push(withSlot(item, cursor, 8 + row * 28, widths[index], targetH));
      cursor += widths[index] + gap;
    });
  }
  return result;
}

function diamond(items: Piece[], wall: Wall, density: number): Piece[] {
  if (!items.length) return [];
  const sorted = [...items].sort((a, b) => b.widthCm * b.heightCm - a.widthCm * a.heightCm);
  const columns = Math.max(3, Math.ceil(Math.sqrt(items.length)));
  const rows = Math.ceil(items.length / columns);
  const gap = 1.1 + (100 - density) * 0.018;
  const h = Math.min(19, (82 - gap * (rows - 1)) / rows);
  return sorted.map((item, index) => {
    const row = Math.floor(index / columns);
    const rowItems = sorted.slice(row * columns, (row + 1) * columns);
    const widths = rowItems.map((entry) => h * aspect(entry) * (wall.heightCm / wall.widthCm));
    const total = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, rowItems.length - 1);
    const inRow = index % columns;
    const preceding = widths.slice(0, inRow).reduce((a, b) => a + b, 0) + gap * inRow;
    const middleDistance = Math.abs(row - (rows - 1) / 2);
    const indent = middleDistance * 3.2;
    const scale = Math.min(1, (92 - indent * 2) / total);
    const w = widths[inRow] * scale;
    return withSlot(item, (100 - total * scale) / 2 + preceding * scale, 9 + row * (h + gap), w, h * scale);
  });
}

function compass(items: Piece[], wall: Wall, density: number): Piece[] {
  if (items.length < 5) return fitRows(items, wall, density);
  const heroIndex = items.reduce((best, item, index) => item.widthCm * item.heightCm > items[best].widthCm * items[best].heightCm ? index : best, 0);
  const hero = items[heroIndex];
  const rest = items.filter((_, index) => index !== heroIndex);
  const laid = fitRows(rest, wall, density, 8, 82).map((item) => ({ ...item, w: item.w * 0.82, h: item.h * 0.82, x: 50 + (item.x - 50) * 1.05 }));
  const heroH = 38;
  const heroW = heroH * aspect(hero) * (wall.heightCm / wall.widthCm);
  const withHero = laid.map((item) => {
    const nearCenter = item.x < 58 && item.x + item.w > 42 && item.y < 76 && item.y + item.h > 25;
    return nearCenter ? { ...item, x: item.x < 50 ? item.x - 9 : item.x + 9 } : item;
  });
  return [...withHero, withSlot(hero, 50 - heroW / 2, 31, heroW, heroH)];
}

type Point = { x: number; y: number };

function pieceGeometry(piece: Pick<Piece, 'x' | 'y' | 'w' | 'h' | 'rotation'>, wall: Wall, clearanceCm = 0) {
  const radians = piece.rotation * Math.PI / 180;
  const axisX = { x: Math.cos(radians), y: Math.sin(radians) };
  const axisY = { x: -Math.sin(radians), y: Math.cos(radians) };
  const extra = Math.max(0, clearanceCm) / 2;
  return {
    centre: {
      x: (piece.x + piece.w / 2) / 100 * wall.widthCm,
      y: (piece.y + piece.h / 2) / 100 * wall.heightCm,
    },
    axisX,
    axisY,
    halfWidth: piece.w / 200 * wall.widthCm + extra,
    halfHeight: piece.h / 200 * wall.heightCm + extra,
  };
}

export function pieceVisualCorners(piece: Pick<Piece, 'x' | 'y' | 'w' | 'h' | 'rotation'>, wall: Wall): Point[] {
  const shape = pieceGeometry(piece, wall);
  return [
    { x: -shape.halfWidth, y: -shape.halfHeight },
    { x: shape.halfWidth, y: -shape.halfHeight },
    { x: shape.halfWidth, y: shape.halfHeight },
    { x: -shape.halfWidth, y: shape.halfHeight },
  ].map(({ x, y }) => ({
    x: shape.centre.x + shape.axisX.x * x + shape.axisY.x * y,
    y: shape.centre.y + shape.axisX.y * x + shape.axisY.y * y,
  }));
}

export function collectionVisualBounds(pieces: Array<Pick<Piece, 'x' | 'y' | 'w' | 'h' | 'rotation'>>, wall: Wall) {
  const corners = pieces.flatMap((piece) => pieceVisualCorners(piece, wall));
  if (!corners.length) return { x: 0, y: 0, w: 0, h: 0, leftCm: 0, topCm: 0, widthCm: 0, heightCm: 0 };
  const minX = Math.min(...corners.map((corner) => corner.x));
  const maxX = Math.max(...corners.map((corner) => corner.x));
  const minY = Math.min(...corners.map((corner) => corner.y));
  const maxY = Math.max(...corners.map((corner) => corner.y));
  return {
    x: minX / wall.widthCm * 100,
    y: minY / wall.heightCm * 100,
    w: (maxX - minX) / wall.widthCm * 100,
    h: (maxY - minY) / wall.heightCm * 100,
    leftCm: minX,
    topCm: minY,
    widthCm: maxX - minX,
    heightCm: maxY - minY,
  };
}

export function pieceVisualBounds(piece: Pick<Piece, 'x' | 'y' | 'w' | 'h' | 'rotation'>, wall: Wall) {
  return collectionVisualBounds([piece], wall);
}

function representativeTone(members: Piece[]) {
  const counts = new Map<Piece['tone'], number>();
  members.forEach(({ tone }) => counts.set(tone, (counts.get(tone) ?? 0) + 1));
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'neutral';
}

function layoutUnit(id: string, code: string, kind: LayoutUnit['kind'], members: Piece[], wall: Wall): LayoutUnit {
  const bounds = collectionVisualBounds(members, wall);
  const hasPhoto = members.some((piece) => piece.kind !== 'text');
  const locked = members.some((piece) => piece.locked) || !hasPhoto;
  const categories = [...new Set(members.map(({ category }) => category))];
  const tones = [...new Set(members.map(({ tone }) => tone))];
  const representative = members[0];
  const groupedName = members.map(({ name }) => name.trim()).filter(Boolean).join(' + ');
  const proxy: Piece = {
    id,
    code,
    name: kind === 'group' ? groupedName || `${members.length} grouped wall items` : representative.name,
    src: representative.src,
    widthCm: Math.max(.01, bounds.widthCm),
    heightCm: Math.max(.01, bounds.heightCm),
    x: bounds.x,
    y: bounds.y,
    w: bounds.w,
    h: bounds.h,
    rotation: 0,
    placed: true,
    locked,
    category: categories.join(' + ') || 'Unsorted',
    tone: representativeTone(members),
    color: representative.color,
    kind: 'photo',
  };
  return {
    id,
    code,
    name: proxy.name,
    kind,
    memberIds: members.map(({ id: memberId }) => memberId),
    memberCodes: members.map(({ code: memberCode }) => memberCode),
    members,
    proxy,
    hasPhoto,
    locked,
    categories,
    tones,
  };
}

/** Collapse active wall groups into rigid visual units for manual and AI layouts. */
export function buildLayoutUnits(pieces: Piece[], groups: PrintGroup[], wall: Wall): LayoutUnit[] {
  const placed = pieces.filter((piece) => piece.placed);
  const placedById = new Map(placed.map((piece) => [piece.id, piece]));
  const pieceOrder = new Map(pieces.map((piece, index) => [piece.id, index]));
  const claimed = new Set<string>();
  const activeGroups = groups.flatMap((group) => {
    const members = group.memberIds.flatMap((memberId) => {
      const member = placedById.get(memberId);
      return member && !claimed.has(memberId) ? [member] : [];
    }).sort((a, b) => (pieceOrder.get(a.id) ?? 0) - (pieceOrder.get(b.id) ?? 0));
    if (members.length < 2) return [];
    members.forEach(({ id }) => claimed.add(id));
    return [{ group, members }];
  });
  const groupByMember = new Map<string, (typeof activeGroups)[number]>();
  activeGroups.forEach((active) => active.members.forEach(({ id }) => groupByMember.set(id, active)));
  const emitted = new Set<string>();
  const units: LayoutUnit[] = [];
  placed.forEach((piece) => {
    const active = groupByMember.get(piece.id);
    if (active) {
      if (!emitted.has(active.group.id)) {
        emitted.add(active.group.id);
        units.push(layoutUnit(active.group.id, active.group.code, 'group', active.members, wall));
      }
      return;
    }
    units.push(layoutUnit(piece.id, piece.code, piece.kind === 'text' ? 'text' : 'photo', [piece], wall));
  });
  return units;
}

export function piecesOverlap(
  a: Pick<Piece, 'x' | 'y' | 'w' | 'h' | 'rotation'>,
  b: Pick<Piece, 'x' | 'y' | 'w' | 'h' | 'rotation'>,
  wall: Wall,
  clearanceCm = 0,
  toleranceCm = 0.1,
) {
  const first = pieceGeometry(a, wall, clearanceCm);
  const second = pieceGeometry(b, wall, clearanceCm);
  const delta = { x: second.centre.x - first.centre.x, y: second.centre.y - first.centre.y };
  const axes = [first.axisX, first.axisY, second.axisX, second.axisY];
  const epsilonCm = Math.max(toleranceCm, Math.max(wall.widthCm, wall.heightCm) * 0.0001);
  return axes.every((axis) => {
    const centreDistance = Math.abs(delta.x * axis.x + delta.y * axis.y);
    const firstRadius = first.halfWidth * Math.abs(first.axisX.x * axis.x + first.axisX.y * axis.y)
      + first.halfHeight * Math.abs(first.axisY.x * axis.x + first.axisY.y * axis.y);
    const secondRadius = second.halfWidth * Math.abs(second.axisX.x * axis.x + second.axisX.y * axis.y)
      + second.halfHeight * Math.abs(second.axisY.x * axis.x + second.axisY.y * axis.y);
    return centreDistance < firstRadius + secondRadius - epsilonCm;
  });
}

function overlapArea(a: Pick<Piece, 'x' | 'y' | 'w' | 'h'>, b: Pick<Piece, 'x' | 'y' | 'w' | 'h'>, gapX: number, gapY: number) {
  const left = Math.max(a.x - gapX / 2, b.x - gapX / 2);
  const right = Math.min(a.x + a.w + gapX / 2, b.x + b.w + gapX / 2);
  const top = Math.max(a.y - gapY / 2, b.y - gapY / 2);
  const bottom = Math.min(a.y + a.h + gapY / 2, b.y + b.h + gapY / 2);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function positionAtTarget(piece: Piece, target: Piece, obstacles: Piece[], wall: Wall, density: number) {
  const visual = pieceVisualBounds(piece, wall);
  const halfVisualW = visual.w / 2;
  const halfVisualH = visual.h / 2;
  const minX = visual.w <= 100 ? halfVisualW - piece.w / 2 : 50 - piece.w / 2;
  const maxX = visual.w <= 100 ? 100 - halfVisualW - piece.w / 2 : minX;
  const minY = visual.h <= 100 ? halfVisualH - piece.h / 2 : 50 - piece.h / 2;
  const maxY = visual.h <= 100 ? 100 - halfVisualH - piece.h / 2 : minY;
  const targetX = clamp(target.x + target.w / 2 - piece.w / 2, minX, maxX);
  const targetY = clamp(target.y + target.h / 2 - piece.h / 2, minY, maxY);
  const gapCm = density < 45 ? 2 : density > 75 ? .8 : 1.2;
  const gapX = gapCm / Math.max(1, wall.widthCm) * 100;
  const gapY = gapCm / Math.max(1, wall.heightCm) * 100;
  const obstacleBounds = obstacles.map((obstacle) => pieceVisualBounds(obstacle, wall));
  let best = { x: targetX, y: targetY, collision: Number.POSITIVE_INFINITY, distance: Number.POSITIVE_INFINITY };
  const scoreAt = (x: number, y: number) => {
    const candidatePiece = { ...piece, x, y };
    const candidate = pieceVisualBounds(candidatePiece, wall);
    const collision = obstacleBounds.reduce((sum, obstacle, index) => {
      if (!piecesOverlap(candidatePiece, obstacles[index], wall, gapCm, 0)) return sum;
      return sum + Math.max(0.000001, overlapArea(candidate, obstacle, gapX, gapY));
    }, 0);
    const distance = ((x - targetX) / Math.max(1, maxX - minX)) ** 2 + ((y - targetY) / Math.max(1, maxY - minY)) ** 2;
    return { collision, distance };
  };
  const consider = (rawX: number, rawY: number) => {
    const x = clamp(rawX, minX, maxX);
    const y = clamp(rawY, minY, maxY);
    const score = scoreAt(x, y);
    if (score.collision < best.collision
      || (score.collision === best.collision && score.distance < best.distance)) {
      best = { x, y, ...score };
    }
    return score.collision === 0;
  };

  let foundClear = consider(targetX, targetY);
  if (!foundClear) {
    const stepX = Math.max(1.4, gapX, visual.w * .16);
    const stepY = Math.max(1.4, gapY, visual.h * .16);
    for (let ring = 1; ring <= 28 && !foundClear; ring += 1) {
      for (let spoke = 0; spoke < 20; spoke += 1) {
        const angle = spoke / 20 * Math.PI * 2;
        if (consider(targetX + Math.cos(angle) * stepX * ring, targetY + Math.sin(angle) * stepY * ring)) {
          foundClear = true;
          break;
        }
      }
    }
  }
  if (!foundClear) foundClear = consider(piece.x, piece.y);
  if (!foundClear) {
    const columns = 64;
    const rows = 44;
    gridSearch: for (let row = 0; row <= rows; row += 1) {
      for (let column = 0; column <= columns; column += 1) {
        if (consider(minX + (maxX - minX) * column / columns, minY + (maxY - minY) * row / rows)) {
          foundClear = true;
          break gridSearch;
        }
      }
    }
  }
  return { ...piece, x: best.x, y: best.y, placed: true };
}

function orderForGrouping(items: Piece[], groupStrength: number) {
  if (groupStrength >= 55) {
    return [...items].sort((a, b) => a.category.localeCompare(b.category)
      || a.tone.localeCompare(b.tone)
      || a.id.localeCompare(b.id));
  }
  if (groupStrength <= 45) {
    const toneCycle: Piece['tone'][] = ['warm', 'cool', 'pastel', 'dark', 'neutral'];
    const buckets = new Map(toneCycle.map((tone) => [tone, items.filter((piece) => piece.tone === tone)]));
    const contrasted: Piece[] = [];
    while (contrasted.length < items.length) {
      toneCycle.forEach((tone) => {
        const next = buckets.get(tone)?.shift();
        if (next) contrasted.push(next);
      });
    }
    return contrasted;
  }
  return items;
}

function applyLayoutToProxies(pieces: Piece[], layout: LayoutName, wall: Wall, density: number, groupStrength: number): Piece[] {
  const movable = pieces.filter((piece) => piece.placed && !piece.locked);
  const ordered = layout === 'flow'
    ? [...movable].sort((a, b) => ({ pastel: 0, warm: 1, neutral: 2, cool: 3, dark: 4 }[a.tone] - ({ pastel: 0, warm: 1, neutral: 2, cool: 3, dark: 4 }[b.tone])))
    : orderForGrouping(movable, groupStrength);
  const laid = layout === 'organic' ? masonry(ordered, wall, density)
    : layout === 'strip' ? filmStrip(ordered, wall, density)
      : layout === 'diamond' ? diamond(ordered, wall, density)
        : layout === 'compass' ? compass(ordered, wall, density)
          : fitRows(ordered, wall, density);
  const targets = new Map(laid.map((piece) => [piece.id, piece]));
  const fixed = pieces.filter((piece) => piece.locked && piece.placed).map((piece) => ({ ...piece }));
  const placed = new Map<string, Piece>();
  [...movable]
    .sort((a, b) => b.w * b.h - a.w * a.h || a.id.localeCompare(b.id))
    .forEach((piece) => {
      const target = targets.get(piece.id) ?? piece;
      const next = positionAtTarget(piece, target, [...fixed, ...placed.values()], wall, density);
      placed.set(piece.id, next);
    });
  return pieces.map((piece) => piece.locked ? piece : placed.get(piece.id) ?? piece);
}

function translateLayoutUnits(pieces: Piece[], units: LayoutUnit[], nextProxies: Map<string, Piece>) {
  const translations = new Map<string, { x: number; y: number }>();
  units.forEach((unit) => {
    const next = nextProxies.get(unit.id);
    if (!next || unit.locked) return;
    const translation = { x: next.x - unit.proxy.x, y: next.y - unit.proxy.y };
    unit.memberIds.forEach((memberId) => translations.set(memberId, translation));
  });
  return pieces.map((piece) => {
    const translation = translations.get(piece.id);
    return translation ? { ...piece, x: piece.x + translation.x, y: piece.y + translation.y } : piece;
  });
}

export function applyLayout(
  pieces: Piece[],
  layout: LayoutName,
  wall: Wall,
  density = 58,
  groupStrength = 50,
  groups: PrintGroup[] = [],
): Piece[] {
  // Compositions operate only on already-placed wall units. Active groups are
  // represented by one visual envelope, then every member receives the same
  // translation so its overlap, text placement, rotation, and layer order stay intact.
  const units = buildLayoutUnits(pieces, groups, wall);
  const proxies = units.map(({ proxy }) => proxy);
  const laid = applyLayoutToProxies(proxies, layout, wall, density, groupStrength);
  return translateLayoutUnits(pieces, units, new Map(laid.map((proxy) => [proxy.id, proxy])));
}

export function applyCustomLayout(
  pieces: Piece[],
  targets: LayoutTarget[],
  wall: Wall,
  density = 58,
  groups: PrintGroup[] = [],
): Piece[] {
  const units = buildLayoutUnits(pieces, groups, wall);
  const targetById = new Map(targets.map((target) => [target.unitId, target]));
  const movable = units.filter((unit) => !unit.locked && targetById.has(unit.id));
  const fixed = units.filter((unit) => unit.locked || !targetById.has(unit.id)).map(({ proxy }) => proxy);
  const placed = new Map<string, Piece>();
  [...movable]
    .sort((a, b) => b.proxy.w * b.proxy.h - a.proxy.w * a.proxy.h || a.id.localeCompare(b.id))
    .forEach((unit) => {
      const target = targetById.get(unit.id);
      if (!target) return;
      const targetProxy = {
        ...unit.proxy,
        x: target.centerXPercent - unit.proxy.w / 2,
        y: target.centerYPercent - unit.proxy.h / 2,
      };
      const next = positionAtTarget(unit.proxy, targetProxy, [...fixed, ...placed.values()], wall, density);
      placed.set(unit.id, next);
    });
  return translateLayoutUnits(pieces, units, placed);
}

type FreeRect = { x: number; y: number; w: number; h: number };
type PackingPage = PrintPackPage & { free: FreeRect[] };
type PrintOrientation = { sheetRotation: PrintSheetRotation; widthCm: number; heightCm: number };
const PACK_EPSILON = 0.0001;

function printOrientation(item: PrintPackItem, sheetRotation: PrintSheetRotation): PrintOrientation {
  return isQuarterTurn(sheetRotation)
    ? { sheetRotation, widthCm: item.heightCm, heightCm: item.widthCm }
    : { sheetRotation, widthCm: item.widthCm, heightCm: item.heightCm };
}

function printOrientations(item: PrintPackItem, allow90Rotation: boolean): PrintOrientation[] {
  if (item.rotationPreference !== undefined) return [printOrientation(item, item.rotationPreference)];
  const orientations = [printOrientation(item, 0)];
  if (allow90Rotation && Math.abs(item.widthCm - item.heightCm) > PACK_EPSILON) {
    orientations.push(printOrientation(item, 90));
  }
  return orientations;
}

function isBetterPackingScore(candidate: number[], current: number[]) {
  for (let index = 0; index < candidate.length; index += 1) {
    if (candidate[index] !== current[index]) return candidate[index] < current[index];
  }
  return false;
}

function containsRect(a: FreeRect, b: FreeRect) {
  return b.x >= a.x - PACK_EPSILON && b.y >= a.y - PACK_EPSILON
    && b.x + b.w <= a.x + a.w + PACK_EPSILON
    && b.y + b.h <= a.y + a.h + PACK_EPSILON;
}

function pruneFreeRects(rects: FreeRect[]) {
  return rects.filter((rect, index) => rect.w > PACK_EPSILON && rect.h > PACK_EPSILON
    && !rects.some((other, otherIndex) => index !== otherIndex && containsRect(other, rect)));
}

function splitFreeRect(free: FreeRect, used: FreeRect) {
  const intersects = used.x < free.x + free.w - PACK_EPSILON
    && used.x + used.w > free.x + PACK_EPSILON
    && used.y < free.y + free.h - PACK_EPSILON
    && used.y + used.h > free.y + PACK_EPSILON;
  if (!intersects) return [free];
  const next: FreeRect[] = [];
  if (used.x > free.x + PACK_EPSILON) next.push({ x: free.x, y: free.y, w: used.x - free.x, h: free.h });
  if (used.x + used.w < free.x + free.w - PACK_EPSILON) next.push({ x: used.x + used.w, y: free.y, w: free.x + free.w - used.x - used.w, h: free.h });
  if (used.y > free.y + PACK_EPSILON) next.push({ x: free.x, y: free.y, w: free.w, h: used.y - free.y });
  if (used.y + used.h < free.y + free.h - PACK_EPSILON) next.push({ x: free.x, y: used.y + used.h, w: free.w, h: free.y + free.h - used.y - used.h });
  return next;
}

function packOrdered(items: PrintPackItem[], usableWidth: number, usableHeight: number, gapCm: number, marginCm: number, allow90Rotation: boolean) {
  const binWidth = usableWidth + gapCm;
  const binHeight = usableHeight + gapCm;
  const pages: PackingPage[] = [];
  for (const item of items) {
    const orientations = printOrientations(item, allow90Rotation);
    let best: { page: number; free: FreeRect; score: number[]; sheetRotation: PrintSheetRotation; footprintW: number; footprintH: number } | null = null;
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
      for (const free of pages[pageIndex].free) {
        for (const orientation of orientations) {
          const footprintW = orientation.widthCm + gapCm;
          const footprintH = orientation.heightCm + gapCm;
          if (footprintW > free.w + PACK_EPSILON || footprintH > free.h + PACK_EPSILON) continue;
          const shortSide = Math.min(free.w - footprintW, free.h - footprintH);
          const longSide = Math.max(free.w - footprintW, free.h - footprintH);
          const score = [shortSide, longSide, item.rotationPreference === undefined && orientation.sheetRotation === 90 ? 1 : 0, pageIndex, free.y, free.x];
          if (!best || isBetterPackingScore(score, best.score)) {
            best = { page: pageIndex, free, score, sheetRotation: orientation.sheetRotation, footprintW, footprintH };
          }
        }
      }
    }
    if (!best) {
      pages.push({ placements: [], usedAreaCm2: 0, free: [{ x: 0, y: 0, w: binWidth, h: binHeight }] });
      const free = pages[pages.length - 1].free[0];
      for (const orientation of orientations) {
        const footprintW = orientation.widthCm + gapCm;
        const footprintH = orientation.heightCm + gapCm;
        if (footprintW > free.w + PACK_EPSILON || footprintH > free.h + PACK_EPSILON) continue;
        const score = [Math.min(free.w - footprintW, free.h - footprintH), Math.max(free.w - footprintW, free.h - footprintH), item.rotationPreference === undefined && orientation.sheetRotation === 90 ? 1 : 0, pages.length - 1, free.y, free.x];
        if (!best || isBetterPackingScore(score, best.score)) {
          best = { page: pages.length - 1, free, score, sheetRotation: orientation.sheetRotation, footprintW, footprintH };
        }
      }
    }
    if (!best) continue;
    const page = pages[best.page];
    const used = { x: best.free.x, y: best.free.y, w: best.footprintW, h: best.footprintH };
    page.placements.push({ ...item, xCm: marginCm + used.x, yCm: marginCm + used.y, sheetRotation: best.sheetRotation });
    page.usedAreaCm2 += item.widthCm * item.heightCm;
    page.free = pruneFreeRects(page.free.flatMap((free) => splitFreeRect(free, used)));
  }
  return pages;
}

function countAutoSheetRotations(pages: PackingPage[]) {
  return pages.reduce((count, page) => count + page.placements.filter((placement) => placement.rotationPreference === undefined && placement.sheetRotation === 90).length, 0);
}

function packWithRotationMode(items: PrintPackItem[], usableWidth: number, usableHeight: number, gapCm: number, marginCm: number, allow90Rotation: boolean) {
  const canFit = (item: PrintPackItem) => printOrientations(item, allow90Rotation).some((orientation) => (
    orientation.widthCm <= usableWidth + PACK_EPSILON
      && orientation.heightCm <= usableHeight + PACK_EPSILON
  ));
  const oversized = items.filter((item) => !canFit(item));
  const placeable = items.filter((item) => !oversized.includes(item));
  const stable = (a: PrintPackItem, b: PrintPackItem) => a.order - b.order || a.instanceId.localeCompare(b.instanceId);
  const variants = [
    [...placeable].sort((a, b) => Math.max(b.widthCm, b.heightCm) - Math.max(a.widthCm, a.heightCm) || b.widthCm * b.heightCm - a.widthCm * a.heightCm || stable(a, b)),
    [...placeable].sort((a, b) => b.widthCm * b.heightCm - a.widthCm * a.heightCm || stable(a, b)),
    [...placeable].sort((a, b) => b.heightCm - a.heightCm || b.widthCm - a.widthCm || stable(a, b)),
    [...placeable].sort((a, b) => (b.widthCm + b.heightCm) - (a.widthCm + a.heightCm) || stable(a, b)),
  ];
  const candidates = variants.map((variant, variantIndex) => ({
    pages: packOrdered(variant, usableWidth, usableHeight, gapCm, marginCm, allow90Rotation),
    variantIndex,
  }));
  const best = candidates.sort((a, b) => a.pages.length - b.pages.length
    || countAutoSheetRotations(a.pages) - countAutoSheetRotations(b.pages)
    || (b.pages.at(-1)?.usedAreaCm2 ?? 0) - (a.pages.at(-1)?.usedAreaCm2 ?? 0)
    || a.variantIndex - b.variantIndex)[0];
  return { pages: best?.pages ?? [], oversized, placeable };
}

export function packPrintItems(items: PrintPackItem[], sheetWidthCm: number, sheetHeightCm: number, gapCm: number, marginCm: number, options: PrintPackOptions = {}): PrintPackResult {
  const safeMargin = Math.max(0, marginCm);
  const usableWidth = Math.max(0, sheetWidthCm - safeMargin * 2);
  const usableHeight = Math.max(0, sheetHeightCm - safeMargin * 2);
  const valid = items.filter((item) => Number.isFinite(item.widthCm) && Number.isFinite(item.heightCm) && item.widthCm > 0 && item.heightCm > 0);
  const invalid = items.filter((item) => !valid.includes(item));
  const safeGap = Math.max(0, gapCm);
  const baseline = packWithRotationMode(valid, usableWidth, usableHeight, safeGap, safeMargin, false);
  const rotating = options.allow90Rotation
    ? packWithRotationMode(valid, usableWidth, usableHeight, safeGap, safeMargin, true)
    : baseline;
  const baselineUnplaced = baseline.oversized.length;
  const rotatingUnplaced = rotating.oversized.length;
  const useRotating = options.allow90Rotation && (rotatingUnplaced < baselineUnplaced
    || (rotatingUnplaced === baselineUnplaced && rotating.pages.length < baseline.pages.length));
  const chosen = useRotating ? rotating : baseline;
  const pages = chosen.pages;
  const unplaced = [...invalid, ...chosen.oversized];
  const totalAreaCm2 = chosen.placeable.reduce((sum, item) => sum + item.widthCm * item.heightCm, 0);
  const usableArea = usableWidth * usableHeight * pages.length;
  return {
    pages: pages.map((page) => ({ placements: page.placements, usedAreaCm2: page.usedAreaCm2 })),
    unplaced,
    totalAreaCm2,
    sparePercent: usableArea > 0 ? Math.max(0, Math.round((1 - totalAreaCm2 / usableArea) * 100)) : 100,
  };
}
