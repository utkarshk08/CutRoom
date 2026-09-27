import type {
  PrintOverride,
  PrintPaper,
  PrintRotationOverride,
} from './project-document.ts';
import type { Piece, PrintGroup, Wall } from './studio.ts';
import { cloneTextData } from './text-elements.ts';

/**
 * Durable editing state that Undo/Redo is allowed to restore.
 *
 * Identity ledgers are deliberately absent: once a photo ID or visible code is
 * issued it must stay tombstoned, even after undoing and branching. Selection,
 * zoom, open panels, and other transient UI state are also intentionally out of
 * scope.
 */
export type EditorSnapshot = {
  pieces: Piece[];
  printGroups: PrintGroup[];
  wall: Wall;
  showWallLabels: boolean;
  autoRotatePrint: boolean;
  printOverrides: Record<string, PrintOverride>;
  printRotationOverrides: Record<string, PrintRotationOverride>;
  printPaper: PrintPaper;
  customSheetW: number;
  customSheetH: number;
  printLandscape: boolean;
  printGap: number;
  printMargin: number;
  cropMarks: boolean;
};

export const EDITOR_HISTORY_LIMIT = 40;

function clonePieces(pieces: readonly Piece[]): Piece[] {
  return pieces.map((piece) => ({
    ...piece,
    ...(piece.crop ? { crop: { ...piece.crop } } : {}),
    ...(piece.border ? { border: { ...piece.border, edges: { ...piece.border.edges } } } : {}),
    ...(piece.text ? { text: cloneTextData(piece.text) } : {}),
  }));
}

function clonePrintOverrides(overrides: Readonly<Record<string, PrintOverride>>) {
  return Object.fromEntries(
    Object.entries(overrides).map(([id, size]) => [id, { ...size }]),
  );
}

function clonePrintRotationOverrides(
  overrides: Readonly<Record<string, PrintRotationOverride>>,
) {
  return Object.fromEntries(Object.entries(overrides));
}

/** Make a mutation-safe copy while dropping any accidental transient fields. */
export function cloneEditorSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  return {
    pieces: clonePieces(snapshot.pieces),
    printGroups: snapshot.printGroups.map((group) => ({ ...group, memberIds: [...group.memberIds] })),
    wall: { ...snapshot.wall },
    showWallLabels: snapshot.showWallLabels,
    autoRotatePrint: snapshot.autoRotatePrint,
    printOverrides: clonePrintOverrides(snapshot.printOverrides),
    printRotationOverrides: clonePrintRotationOverrides(snapshot.printRotationOverrides),
    printPaper: snapshot.printPaper,
    customSheetW: snapshot.customSheetW,
    customSheetH: snapshot.customSheetH,
    printLandscape: snapshot.printLandscape,
    printGap: snapshot.printGap,
    printMargin: snapshot.printMargin,
    cropMarks: snapshot.cropMarks,
  };
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (
    left === null
    || right === null
    || typeof left !== 'object'
    || typeof right !== 'object'
  ) return false;

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((value, index) => valuesEqual(value, right[index]));
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every((key) => (
    Object.prototype.hasOwnProperty.call(rightRecord, key)
    && valuesEqual(leftRecord[key], rightRecord[key])
  ));
}

/** Compare snapshots without depending on object-key insertion order. */
export function editorSnapshotsEqual(left: EditorSnapshot, right: EditorSnapshot) {
  return valuesEqual(left, right);
}

/**
 * Append a defensive copy to history and retain only the newest `limit`
 * entries. The input array and snapshot are never mutated.
 */
export function pushHistorySnapshot(
  history: readonly EditorSnapshot[],
  snapshot: EditorSnapshot,
  limit = EDITOR_HISTORY_LIMIT,
): EditorSnapshot[] {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError('Editor history limit must be a positive safe integer.');
  }
  return [
    ...history.slice(Math.max(0, history.length - limit + 1)),
    cloneEditorSnapshot(snapshot),
  ];
}
