export const PRINT_SHEET_ROTATIONS = [-90, 0, 90, 180] as const;

export type PrintSheetRotation = typeof PRINT_SHEET_ROTATIONS[number];

export function isPrintSheetRotation(value: unknown): value is PrintSheetRotation {
  return PRINT_SHEET_ROTATIONS.some((rotation) => Object.is(rotation, value) || rotation === value);
}

export function isQuarterTurn(rotation: PrintSheetRotation) {
  return Math.abs(rotation) === 90;
}
