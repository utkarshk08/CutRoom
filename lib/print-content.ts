import {
  collectionVisualBounds,
  type Piece,
  type PrintGroup,
  type Wall,
} from './studio.ts';

export type PrintContentMember = {
  pieceId: string;
  leftCm: number;
  topCm: number;
  widthCm: number;
  heightCm: number;
  rotation: number;
};

export type PrintContent = {
  id: string;
  code: string;
  name: string;
  kind: 'piece' | 'group';
  memberIds: string[];
  members: PrintContentMember[];
  widthCm: number;
  heightCm: number;
};

export type PrintSizeOverride = { widthCm: number; heightCm: number };

const physicalTopLeft = (piece: Piece, wall: Wall) => ({
  x: piece.x / 100 * wall.widthCm,
  y: piece.y / 100 * wall.heightCm,
});

function singleContent(piece: Piece): PrintContent {
  return {
    id: piece.id,
    code: piece.code,
    name: piece.name,
    kind: 'piece',
    memberIds: [piece.id],
    members: [{
      pieceId: piece.id,
      leftCm: 0,
      topCm: 0,
      widthCm: piece.widthCm,
      heightCm: piece.heightCm,
      rotation: 0,
    }],
    widthCm: piece.widthCm,
    heightCm: piece.heightCm,
  };
}

function groupedContent(group: PrintGroup, members: Piece[], wall: Wall): PrintContent {
  const bounds = collectionVisualBounds(members, wall);
  const widthCm = Math.max(0.01, bounds.widthCm);
  const heightCm = Math.max(0.01, bounds.heightCm);
  return {
    id: group.id,
    code: group.code,
    name: `${members.length} wall items together`,
    kind: 'group',
    memberIds: members.map(({ id }) => id),
    members: members.map((piece) => {
      const position = physicalTopLeft(piece, wall);
      return {
        pieceId: piece.id,
        leftCm: position.x - bounds.leftCm,
        topCm: position.y - bounds.topCm,
        widthCm: piece.widthCm,
        heightCm: piece.heightCm,
        rotation: piece.rotation,
      };
    }),
    widthCm,
    heightCm,
  };
}

/**
 * Collapse active print groups while leaving ungrouped wall elements as their
 * own print items. A grouped text element prints even when its individual
 * Print Pack toggle is off because grouping is an explicit print instruction.
 */
export function buildPrintContents(
  orderedPlacedPieces: Piece[],
  groups: PrintGroup[],
  wall: Wall,
): PrintContent[] {
  const placedById = new Map(orderedPlacedPieces.filter(({ placed }) => placed).map((piece) => [piece.id, piece]));
  const claimed = new Set<string>();
  const activeGroups = groups.flatMap((group) => {
    const members = group.memberIds.flatMap((id) => {
      const piece = placedById.get(id);
      return piece && !claimed.has(id) ? [piece] : [];
    }).sort((a, b) => orderedPlacedPieces.indexOf(a) - orderedPlacedPieces.indexOf(b));
    if (members.length < 2) return [];
    members.forEach(({ id }) => claimed.add(id));
    return [{ group, members }];
  });
  const groupByMember = new Map<string, (typeof activeGroups)[number]>();
  activeGroups.forEach((active) => active.members.forEach(({ id }) => groupByMember.set(id, active)));
  const emittedGroups = new Set<string>();
  const result: PrintContent[] = [];

  orderedPlacedPieces.forEach((piece) => {
    if (!piece.placed) return;
    const active = groupByMember.get(piece.id);
    if (active) {
      if (!emittedGroups.has(active.group.id)) {
        emittedGroups.add(active.group.id);
        result.push(groupedContent(active.group, active.members, wall));
      }
      return;
    }
    if (piece.kind === 'text' && piece.text?.printable === false) return;
    result.push(singleContent(piece));
  });
  return result;
}

export function groupIdsForMembers(groups: PrintGroup[], memberIds: Iterable<string>) {
  const ids = new Set(memberIds);
  return groups.filter((group) => group.memberIds.some((memberId) => ids.has(memberId))).map(({ id }) => id);
}

export function removeMembersFromPrintGroups(groups: PrintGroup[], memberIds: Iterable<string>) {
  const removed = new Set(memberIds);
  return groups.flatMap((group) => {
    const members = group.memberIds.filter((id) => !removed.has(id));
    return members.length >= 2 ? [{ ...group, memberIds: members }] : [];
  });
}

/**
 * Return the shared percentage used by every current print item, or `null`
 * when individual edits have produced mixed scales or changed an aspect ratio.
 */
export function uniformPrintScalePercent(
  contents: readonly PrintContent[],
  overrides: Readonly<Record<string, PrintSizeOverride>>,
) {
  if (!contents.length) return 100;
  let sharedScale: number | undefined;
  for (const content of contents) {
    const size = overrides[content.id] ?? content;
    const widthScale = size.widthCm / Math.max(0.01, content.widthCm);
    const heightScale = size.heightCm / Math.max(0.01, content.heightCm);
    if (Math.abs(widthScale - heightScale) > 0.001) return null;
    if (sharedScale !== undefined && Math.abs(sharedScale - widthScale) > 0.001) return null;
    sharedScale = widthScale;
  }
  const percent = (sharedScale ?? 1) * 100;
  return percent >= 25 && percent <= 200 ? Math.round(percent * 10) / 10 : null;
}

/** Build proportional Print Pack overrides from each item's unmodified wall size. */
export function scaleAllPrintContents(
  contents: readonly PrintContent[],
  requestedPercent: number,
): Record<string, PrintSizeOverride> {
  const percent = Number.isFinite(requestedPercent)
    ? Math.min(200, Math.max(25, requestedPercent))
    : 100;
  if (Math.abs(percent - 100) < 0.001) return {};
  const scale = percent / 100;
  return Object.fromEntries(contents.map((content) => [content.id, {
    widthCm: content.widthCm * scale,
    heightCm: content.heightCm * scale,
  }]));
}
