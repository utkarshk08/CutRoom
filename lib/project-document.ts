import type { Piece, PhotoCrop, PrintGroup, Wall } from './studio.ts';
import { isPrintSheetRotation, type PrintSheetRotation } from './print-rotation.ts';
import { normalizePhotoBorder } from './photo-border.ts';
import { sanitizeTextData } from './text-elements.ts';

export const PROJECT_SCHEMA_VERSION = 7 as const;
export const MAX_BACKUP_BYTES = 350 * 1024 * 1024;
export const MAX_PROJECT_PIECES = 2_000;

export type MeasurementUnit = 'cm' | 'in';
export type PrintOverride = { widthCm: number; heightCm: number };
export type PrintRotationOverride = PrintSheetRotation;
export type PrintPaper = 'A6' | 'A5' | 'A4' | 'A3' | 'A2' | 'A1' | 'Custom';
export type PhotoSizePreset = Exclude<PrintPaper, 'Custom'> | 'Original';
export type PrintExportFormat = 'pdf' | 'png' | 'jpg';
export type PrintDpi = 150 | 300;

export type IdentityRegistryV1 = {
  version: 1;
  issuedIds: string[];
  issuedCodes: string[];
  nextPhoto: number;
  nextSheet: number;
  nextText: number;
  nextGroup: number;
  copyCounters: Record<string, number>;
};

export type ProjectDocument = {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  name: string;
  pieces: Piece[];
  printGroups: PrintGroup[];
  wall: Wall;
  measurementUnit: MeasurementUnit;
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
  printExportFormat: PrintExportFormat;
  printDpi: PrintDpi;
  posterPreset: PhotoSizePreset;
  sheetPaper: Exclude<PrintPaper, 'Custom'>;
  identity: IdentityRegistryV1;
  updatedAt: string;
};

export type ProjectValidationResult = {
  project: ProjectDocument;
  warnings: string[];
  repairedIds: number;
  repairedCodes: number;
  sourceSchemaVersion: number;
  needsPersistence: boolean;
};

type LegacyPiece = Omit<Piece, 'code'> & { code?: string };
type UnknownRecord = Record<string, unknown>;
type MintId = () => string;

const TONES = new Set<Piece['tone']>(['pastel', 'warm', 'cool', 'dark', 'neutral']);
const PRINT_PAPERS = new Set<PrintPaper>(['A6', 'A5', 'A4', 'A3', 'A2', 'A1', 'Custom']);
const PHOTO_PRESETS = new Set<PhotoSizePreset>(['A6', 'A5', 'A4', 'A3', 'A2', 'A1', 'Original']);
const SHEET_PAPERS = new Set<Exclude<PrintPaper, 'Custom'>>(['A6', 'A5', 'A4', 'A3', 'A2', 'A1']);
const EXPORT_FORMATS = new Set<PrintExportFormat>(['pdf', 'png', 'jpg']);
const MAX_TEXT = 500;
const MAX_MEASUREMENT = 10_000;
const MAX_COORDINATE = 100_000;
const MAX_IDENTITY_TEXT = 96;
const MAX_IDENTITY_HISTORY = 100_000;
const MAX_SEQUENCE = 999_999_999;
const COPY_SUFFIX_RESERVE = 12;

const isRecord = (value: unknown): value is UnknownRecord => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const boundedNumber = (value: unknown, fallback: number, min: number, max: number) => finite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const cleanString = (value: unknown, fallback: string, max = MAX_TEXT) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback;
const optionalString = (value: unknown, max = MAX_TEXT) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
const validHexColor = (value: unknown, fallback: string) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
const safeIdentityText = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, MAX_IDENTITY_TEXT) : '';
const safeSequence = (value: unknown) => {
  if (!finite(value)) return undefined;
  const sequence = Math.floor(value);
  return Number.isSafeInteger(sequence) && sequence >= 0 && sequence <= MAX_SEQUENCE ? sequence : undefined;
};
const sequenceFromDigits = (digits: string) => safeSequence(Number(digits));
const counterRecord = () => Object.create(null) as Record<string, number>;

export function isSafeProjectImageSource(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false;
  if (value.startsWith('/demo/')) return !value.includes('..') && !Array.from(value).some((character) => character.charCodeAt(0) < 32);
  return /^data:image\/(?:png|jpeg|webp);base64,/i.test(value);
}

function defaultMintId() {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure photo IDs are unavailable in this browser.');
  return globalThis.crypto.randomUUID();
}

function registryFromUnknown(raw: unknown, pieces: Array<Pick<LegacyPiece, 'id' | 'code'>>): IdentityRegistryV1 {
  const source = isRecord(raw) ? raw : {};
  const issuedIds = new Set<string>();
  const issuedCodes = new Set<string>();
  const rawIds = Array.isArray(source.issuedIds) ? source.issuedIds : [];
  const rawCodes = Array.isArray(source.issuedCodes) ? source.issuedCodes : [];
  if (rawIds.length > MAX_IDENTITY_HISTORY || rawCodes.length > MAX_IDENTITY_HISTORY) {
    throw new Error('This backup contains an unusually large photo identity history and cannot be safely opened.');
  }
  rawIds.forEach((value) => { const id = safeIdentityText(value); if (id) issuedIds.add(id); });
  rawCodes.forEach((value) => { const code = safeIdentityText(value); if (code) issuedCodes.add(code); });
  pieces.forEach((piece) => {
    const id = safeIdentityText(piece.id);
    const code = safeIdentityText(piece.code);
    if (id) issuedIds.add(id);
    if (code) issuedCodes.add(code);
  });
  if (issuedIds.size > MAX_IDENTITY_HISTORY || issuedCodes.size > MAX_IDENTITY_HISTORY) {
    throw new Error('This project has reached its photo identity history limit. Download a backup before starting a fresh project.');
  }

  // Counters are rebuilt from the immutable issued-code ledger. This makes an
  // imported project immune to poisoned counters while retaining every deleted
  // label as a tombstone, so labels are never recycled after a reload.
  const copyCounters = counterRecord();
  let nextPhoto = 1;
  let nextSheet = 13;
  let nextText = 1;
  let nextGroup = 1;
  issuedCodes.forEach((code) => {
    const photo = /^P(\d+)$/.exec(code);
    const photoSequence = photo ? sequenceFromDigits(photo[1]) : undefined;
    if (photoSequence !== undefined && photoSequence < MAX_SEQUENCE) nextPhoto = Math.max(nextPhoto, photoSequence + 1);
    const sheet = /^S(\d+)-\d+/.exec(code);
    const sheetSequence = sheet ? sequenceFromDigits(sheet[1]) : undefined;
    if (sheetSequence !== undefined && sheetSequence < MAX_SEQUENCE) nextSheet = Math.max(nextSheet, sheetSequence + 1);
    const text = /^T(\d+)$/.exec(code);
    const textSequence = text ? sequenceFromDigits(text[1]) : undefined;
    if (textSequence !== undefined && textSequence < MAX_SEQUENCE) nextText = Math.max(nextText, textSequence + 1);
    const group = /^G(\d+)$/.exec(code);
    const groupSequence = group ? sequenceFromDigits(group[1]) : undefined;
    if (groupSequence !== undefined && groupSequence < MAX_SEQUENCE) nextGroup = Math.max(nextGroup, groupSequence + 1);
    const copy = /^(.*)-C(\d+)$/.exec(code);
    const copySequence = copy ? sequenceFromDigits(copy[2]) : undefined;
    if (copy && copySequence !== undefined) copyCounters[copy[1]] = Math.max(copyCounters[copy[1]] ?? 0, copySequence);
  });

  return {
    version: 1,
    issuedIds: [...issuedIds],
    issuedCodes: [...issuedCodes],
    nextPhoto,
    nextSheet,
    nextText,
    nextGroup,
    copyCounters,
  };
}

export function createIdentityRegistry(
  pieces: Array<Pick<LegacyPiece, 'id' | 'code'>>,
  raw?: unknown,
) {
  return registryFromUnknown(raw, pieces);
}

function cloneRegistry(registry: IdentityRegistryV1): IdentityRegistryV1 {
  const copyCounters = counterRecord();
  Object.entries(registry.copyCounters).forEach(([code, count]) => {
    const safeCount = safeSequence(count);
    if (safeCount !== undefined) copyCounters[code] = safeCount;
  });
  return {
    version: 1,
    issuedIds: [...registry.issuedIds],
    issuedCodes: [...registry.issuedCodes],
    nextPhoto: registry.nextPhoto,
    nextSheet: registry.nextSheet,
    nextText: registry.nextText,
    nextGroup: registry.nextGroup,
    copyCounters,
  };
}

function mintUniqueId(registry: IdentityRegistryV1, mintId: MintId) {
  const issued = new Set(registry.issuedIds);
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const id = safeIdentityText(mintId());
    if (id && !issued.has(id)) {
      registry.issuedIds.push(id);
      return id;
    }
  }
  throw new Error('Could not create a unique photo ID.');
}

function nextPhotoCode(registry: IdentityRegistryV1) {
  const issued = new Set(registry.issuedCodes);
  while (registry.nextPhoto <= MAX_SEQUENCE) {
    const code = `P${String(registry.nextPhoto).padStart(3, '0')}`;
    registry.nextPhoto += 1;
    if (!issued.has(code)) {
      registry.issuedCodes.push(code);
      return code;
    }
  }
  throw new Error('Could not create a unique photo label.');
}

function nextTextCode(registry: IdentityRegistryV1) {
  const issued = new Set(registry.issuedCodes);
  while (registry.nextText <= MAX_SEQUENCE) {
    const code = `T${String(registry.nextText).padStart(3, '0')}`;
    registry.nextText += 1;
    if (!issued.has(code)) {
      registry.issuedCodes.push(code);
      return code;
    }
  }
  throw new Error('Could not create a unique text label.');
}

function nextGroupCode(registry: IdentityRegistryV1) {
  const issued = new Set(registry.issuedCodes);
  while (registry.nextGroup <= MAX_SEQUENCE) {
    const code = `G${String(registry.nextGroup).padStart(3, '0')}`;
    registry.nextGroup += 1;
    if (!issued.has(code)) {
      registry.issuedCodes.push(code);
      return code;
    }
  }
  throw new Error('Could not create a unique print group label.');
}

export type AllocatedIdentity = { id: string; code: string };

export function allocatePhotoIdentities(
  current: IdentityRegistryV1,
  count: number,
  mintId: MintId = defaultMintId,
): { identities: AllocatedIdentity[]; registry: IdentityRegistryV1 } {
  if (!Number.isSafeInteger(count) || count < 0 || count > MAX_PROJECT_PIECES) throw new Error('The requested photo count is invalid.');
  const registry = cloneRegistry(current);
  if (registry.issuedIds.length + count > MAX_IDENTITY_HISTORY || registry.issuedCodes.length + count > MAX_IDENTITY_HISTORY) {
    throw new Error('This project has reached its photo identity history limit. Download a backup before starting a fresh project.');
  }
  const identities = Array.from({ length: count }, () => ({
    id: mintUniqueId(registry, mintId),
    code: nextPhotoCode(registry),
  }));
  return { identities, registry };
}

export function allocateTextIdentity(
  current: IdentityRegistryV1,
  mintId: MintId = defaultMintId,
): { identity: AllocatedIdentity; registry: IdentityRegistryV1 } {
  const registry = cloneRegistry(current);
  if (registry.issuedIds.length >= MAX_IDENTITY_HISTORY || registry.issuedCodes.length >= MAX_IDENTITY_HISTORY) {
    throw new Error('This project has reached its identity history limit. Download a backup before starting a fresh project.');
  }
  return {
    identity: { id: mintUniqueId(registry, mintId), code: nextTextCode(registry) },
    registry,
  };
}

export function allocatePrintGroupIdentity(
  current: IdentityRegistryV1,
  mintId: MintId = defaultMintId,
): { identity: AllocatedIdentity; registry: IdentityRegistryV1 } {
  const registry = cloneRegistry(current);
  if (registry.issuedIds.length >= MAX_IDENTITY_HISTORY || registry.issuedCodes.length >= MAX_IDENTITY_HISTORY) {
    throw new Error('This project has reached its identity history limit. Download a backup before starting a fresh project.');
  }
  return {
    identity: { id: mintUniqueId(registry, mintId), code: nextGroupCode(registry) },
    registry,
  };
}

export function allocateSheetIdentities(
  current: IdentityRegistryV1,
  count: number,
  mintId: MintId = defaultMintId,
): { identities: AllocatedIdentity[]; registry: IdentityRegistryV1; sheetCode: string } {
  if (!Number.isSafeInteger(count) || count < 0 || count > MAX_PROJECT_PIECES) throw new Error('The requested cutout count is invalid.');
  const registry = cloneRegistry(current);
  if (registry.issuedIds.length + count > MAX_IDENTITY_HISTORY || registry.issuedCodes.length + count > MAX_IDENTITY_HISTORY) {
    throw new Error('This project has reached its photo identity history limit. Download a backup before starting a fresh project.');
  }
  const issued = new Set(registry.issuedCodes);
  const cutCount = count;
  let sheetNumber = registry.nextSheet;
  let codes: string[] = [];
  while (sheetNumber <= MAX_SEQUENCE) {
    codes = Array.from({ length: cutCount }, (_, index) => `S${String(sheetNumber).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`);
    if (codes.every((code) => !issued.has(code))) break;
    sheetNumber += 1;
  }
  if (sheetNumber > MAX_SEQUENCE || (cutCount > 0 && codes.some((code) => issued.has(code)))) throw new Error('Could not create unique cutout labels.');
  registry.nextSheet = sheetNumber + 1;
  registry.issuedCodes.push(...codes);
  return {
    identities: codes.map((code) => ({ id: mintUniqueId(registry, mintId), code })),
    registry,
    sheetCode: `S${String(sheetNumber).padStart(2, '0')}`,
  };
}

export function allocateCopyIdentity(
  current: IdentityRegistryV1,
  sourceCode: string,
  mintId: MintId = defaultMintId,
): { identity: AllocatedIdentity; registry: IdentityRegistryV1 } {
  const registry = cloneRegistry(current);
  if (registry.issuedIds.length >= MAX_IDENTITY_HISTORY || registry.issuedCodes.length >= MAX_IDENTITY_HISTORY) {
    throw new Error('This project has reached its photo identity history limit. Download a backup before starting a fresh project.');
  }
  const base = (safeIdentityText(sourceCode) || nextPhotoCode(registry)).slice(0, MAX_IDENTITY_TEXT - COPY_SUFFIX_RESERVE);
  const issued = new Set(registry.issuedCodes);
  let count = safeSequence(registry.copyCounters[base]) ?? 0;
  let code = '';
  do {
    count += 1;
    if (count > MAX_SEQUENCE) throw new Error('Could not create a unique copy label.');
    code = `${base}-C${String(count).padStart(2, '0')}`;
  } while (issued.has(code));
  registry.copyCounters[base] = count;
  registry.issuedCodes.push(code);
  return { identity: { id: mintUniqueId(registry, mintId), code }, registry };
}

function sanitizeCrop(value: unknown): PhotoCrop | undefined {
  if (!isRecord(value)) return undefined;
  const quarterTurns = value.quarterTurns === 1 || value.quarterTurns === 2 || value.quarterTurns === 3 ? value.quarterTurns : 0;
  return {
    mode: value.mode === 'fit' ? 'fit' : 'fill',
    zoom: boundedNumber(value.zoom, 1, 1, 4),
    offsetX: boundedNumber(value.offsetX, 0, -1, 1),
    offsetY: boundedNumber(value.offsetY, 0, -1, 1),
    quarterTurns,
    flipX: value.flipX === true,
    flipY: value.flipY === true,
  };
}

function sanitizePiece(value: unknown, index: number): LegacyPiece {
  if (!isRecord(value)) throw new Error(`Photo ${index + 1} is not a valid project item.`);
  if (!isSafeProjectImageSource(value.src)) throw new Error(`Photo ${index + 1} has an unsafe or unsupported image source.`);
  if (!finite(value.widthCm) || value.widthCm <= 0 || value.widthCm > MAX_MEASUREMENT) throw new Error(`Photo ${index + 1} has an invalid print width.`);
  if (!finite(value.heightCm) || value.heightCm <= 0 || value.heightCm > MAX_MEASUREMENT) throw new Error(`Photo ${index + 1} has an invalid print height.`);
  if (!finite(value.w) || value.w <= 0 || value.w > MAX_COORDINATE || !finite(value.h) || value.h <= 0 || value.h > MAX_COORDINATE) throw new Error(`Photo ${index + 1} has invalid canvas dimensions.`);
  if (!finite(value.x) || Math.abs(value.x) > MAX_COORDINATE || !finite(value.y) || Math.abs(value.y) > MAX_COORDINATE) throw new Error(`Photo ${index + 1} has an invalid wall position.`);
  const tone = typeof value.tone === 'string' && TONES.has(value.tone as Piece['tone']) ? value.tone as Piece['tone'] : 'neutral';
  const sizeMode = value.sizeMode === 'original' || value.sizeMode === 'custom' ? value.sizeMode : 'paper';
  const text = value.kind === 'text' ? sanitizeTextData(value.text) : undefined;
  const kind = text ? 'text' as const : 'photo' as const;
  const legacyOriginalSrc = kind === 'photo' && isSafeProjectImageSource(value.originalSrc) ? value.originalSrc : undefined;
  const sourcePixelW = legacyOriginalSrc && finite(value.originalPixelW) ? value.originalPixelW : value.pixelW;
  const sourcePixelH = legacyOriginalSrc && finite(value.originalPixelH) ? value.originalPixelH : value.pixelH;
  return {
    id: safeIdentityText(value.id),
    code: safeIdentityText(value.code) || undefined,
    name: cleanString(value.name, `Photo ${index + 1}`),
    src: legacyOriginalSrc ?? value.src,
    sourceName: optionalString(value.sourceName),
    widthCm: value.widthCm,
    heightCm: value.heightCm,
    x: value.x,
    y: value.y,
    w: value.w,
    h: value.h,
    rotation: boundedNumber(value.rotation, 0, -180, 180),
    placed: value.placed === true,
    locked: value.locked === true,
    category: cleanString(value.category, 'Unsorted'),
    tone,
    color: validHexColor(value.color, '#8b91a1'),
    sizeMode,
    pixelW: finite(sourcePixelW) && sourcePixelW > 0 ? Math.min(1_000_000, Math.floor(sourcePixelW)) : undefined,
    pixelH: finite(sourcePixelH) && sourcePixelH > 0 ? Math.min(1_000_000, Math.floor(sourcePixelH)) : undefined,
    zIndex: finite(value.zIndex) ? Math.trunc(value.zIndex) : undefined,
    crop: sanitizeCrop(value.crop),
    kind,
    text,
    border: kind === 'photo' ? normalizePhotoBorder(value.border) : undefined,
  };
}

function sanitizeWall(value: unknown): Wall {
  if (!isRecord(value)) throw new Error('The backup does not contain a valid wall.');
  if (!finite(value.widthCm) || value.widthCm < 10 || value.widthCm > MAX_MEASUREMENT) throw new Error('The backup wall width is invalid.');
  if (!finite(value.heightCm) || value.heightCm < 10 || value.heightCm > MAX_MEASUREMENT) throw new Error('The backup wall height is invalid.');
  if (value.photo !== undefined && !isSafeProjectImageSource(value.photo)) throw new Error('The wall photo uses an unsafe or unsupported image source.');
  return {
    widthCm: value.widthCm,
    heightCm: value.heightCm,
    color: validHexColor(value.color, '#eee8dc'),
    photo: value.photo,
    photoOpacity: boundedNumber(value.photoOpacity, 0.8, 0, 1),
    furnitureClearanceCm: boundedNumber(value.furnitureClearanceCm, 0, 0, MAX_MEASUREMENT),
  };
}

function sanitizePrintGroups(value: unknown, pieces: Piece[]) {
  if (!Array.isArray(value)) return [];
  const activeIds = new Set(pieces.map(({ id }) => id));
  const claimedMembers = new Set<string>();
  const groupIds = new Set(pieces.map(({ id }) => id));
  const groupCodes = new Set(pieces.map(({ code }) => code));
  return value.slice(0, pieces.length).flatMap((raw): PrintGroup[] => {
    if (!isRecord(raw)) return [];
    const id = safeIdentityText(raw.id);
    const code = safeIdentityText(raw.code);
    if (!id || !code || groupIds.has(id) || groupCodes.has(code) || !Array.isArray(raw.memberIds)) return [];
    const memberIds = [...new Set(raw.memberIds.map(safeIdentityText).filter((memberId) => activeIds.has(memberId) && !claimedMembers.has(memberId)))];
    if (memberIds.length < 2) return [];
    groupIds.add(id);
    groupCodes.add(code);
    memberIds.forEach((memberId) => claimedMembers.add(memberId));
    return [{ id, code, memberIds }];
  });
}

function sanitizePrintOverrides(value: unknown) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([id, raw]) => {
    if (!isRecord(raw) || !finite(raw.widthCm) || !finite(raw.heightCm) || raw.widthCm <= 0 || raw.heightCm <= 0 || raw.widthCm > MAX_MEASUREMENT || raw.heightCm > MAX_MEASUREMENT) return [];
    return [[safeIdentityText(id), { widthCm: raw.widthCm, heightCm: raw.heightCm }]];
  }).filter(([id]) => id)) as Record<string, PrintOverride>;
}

function sanitizeRotationOverrides(value: unknown) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, rotation]) => Boolean(safeIdentityText(id)) && isPrintSheetRotation(rotation))) as Record<string, PrintRotationOverride>;
}

function migrateIdentities(
  pieces: LegacyPiece[],
  schemaVersion: number,
  rawRegistry: unknown,
  rawOverrides: Record<string, PrintOverride>,
  rawRotations: Record<string, PrintRotationOverride>,
  mintId: MintId,
) {
  let registry = registryFromUnknown(rawRegistry, pieces);
  const usedIds = new Set<string>();
  const usedCodes = new Set<string>();
  // v5 introduced immutable photo IDs and visible codes. Newer schema bumps
  // must not remint those stable identities.
  const legacy = schemaVersion < 5;
  let repairedIds = 0;
  let repairedCodes = 0;
  const references: Array<{ oldId: string; newId: string }> = [];

  const migrated = pieces.map((piece) => {
    const oldId = safeIdentityText(piece.id);
    let id = !legacy && oldId && !usedIds.has(oldId) ? oldId : '';
    if (!id) {
      id = mintUniqueId(registry, mintId);
      repairedIds += 1;
    } else if (!registry.issuedIds.includes(id)) registry.issuedIds.push(id);
    usedIds.add(id);

    const preferredCode = safeIdentityText(legacy ? oldId : piece.code);
    let code = preferredCode && !usedCodes.has(preferredCode) ? preferredCode : '';
    if (!code) {
      code = piece.kind === 'text' ? nextTextCode(registry) : nextPhotoCode(registry);
      repairedCodes += 1;
    } else if (!registry.issuedCodes.includes(code)) registry.issuedCodes.push(code);
    usedCodes.add(code);
    references.push({ oldId, newId: id });
    return { ...piece, id, code } as Piece;
  });

  registry = registryFromUnknown(registry, migrated);
  const printOverrides: Record<string, PrintOverride> = {};
  const printRotationOverrides: Record<string, PrintRotationOverride> = {};
  references.forEach(({ oldId, newId }) => {
    const size = rawOverrides[oldId];
    if (size) printOverrides[newId] = { ...size };
    const rotation = rawRotations[oldId];
    if (isPrintSheetRotation(rotation)) printRotationOverrides[newId] = rotation;
  });
  return { pieces: migrated, identity: registry, printOverrides, printRotationOverrides, repairedIds, repairedCodes };
}

export function validateProjectDocument(
  value: unknown,
  options: { mintId?: MintId } = {},
): ProjectValidationResult {
  if (!isRecord(value)) throw new Error('This file is not a Cutroom project backup.');
  const sourceSchemaVersion = finite(value.schemaVersion) ? Math.floor(value.schemaVersion) : 1;
  if (sourceSchemaVersion > PROJECT_SCHEMA_VERSION) throw new Error('This backup was created by a newer version of Cutroom. Update Cutroom before restoring it.');
  if (!Array.isArray(value.pieces)) throw new Error('The backup does not contain a photo list.');
  if (value.pieces.length > MAX_PROJECT_PIECES) throw new Error(`This backup contains more than ${MAX_PROJECT_PIECES.toLocaleString()} photos.`);
  const restoredLegacyPhotoSource = value.pieces.some((piece) => isRecord(piece) && isSafeProjectImageSource(piece.originalSrc));
  const sanitizedPieces = value.pieces.map(sanitizePiece);
  const wall = sanitizeWall(value.wall);
  const pieces = sanitizedPieces.map((piece) => sourceSchemaVersion >= 2
    ? {
      ...piece,
      w: piece.widthCm / Math.max(1, wall.widthCm) * 100,
      h: piece.heightCm / Math.max(1, wall.heightCm) * 100,
    }
    : {
      ...piece,
      widthCm: piece.w / 100 * wall.widthCm,
      heightCm: piece.h / 100 * wall.heightCm,
    });
  const rawOverrides = sanitizePrintOverrides(value.printOverrides);
  const rawRotations = sanitizeRotationOverrides(value.printRotationOverrides);
  const migration = migrateIdentities(pieces, sourceSchemaVersion, value.identity, rawOverrides, rawRotations, options.mintId ?? defaultMintId);
  const printGroups = sanitizePrintGroups(value.printGroups, migration.pieces);
  const identity = registryFromUnknown(migration.identity, [...migration.pieces, ...printGroups]);
  const activeIds = new Set([...migration.pieces.map((piece) => piece.id), ...printGroups.map((group) => group.id)]);
  const groupIds = new Set(printGroups.map(({ id }) => id));
  const printOverrides = Object.fromEntries([
    ...Object.entries(migration.printOverrides),
    ...Object.entries(rawOverrides).filter(([id]) => groupIds.has(id)),
  ].filter(([id]) => activeIds.has(id)));
  const printRotationOverrides = Object.fromEntries([
    ...Object.entries(migration.printRotationOverrides),
    ...Object.entries(rawRotations).filter(([id]) => groupIds.has(id)),
  ].filter(([id]) => activeIds.has(id))) as Record<string, PrintRotationOverride>;
  const warnings: string[] = [];
  if (sourceSchemaVersion < PROJECT_SCHEMA_VERSION) warnings.push(`Upgraded from project format v${sourceSchemaVersion} to v${PROJECT_SCHEMA_VERSION}.`);
  if (migration.repairedIds) warnings.push(`Repaired ${migration.repairedIds} missing or repeated internal photo ${migration.repairedIds === 1 ? 'ID' : 'IDs'}.`);
  if (migration.repairedCodes) warnings.push(`Created ${migration.repairedCodes} new visible photo ${migration.repairedCodes === 1 ? 'label' : 'labels'} to prevent duplicates.`);
  let identityWasNormalized = true;
  let groupsWereNormalized = true;
  try { identityWasNormalized = JSON.stringify(value.identity) !== JSON.stringify(identity); } catch { identityWasNormalized = true; }
  try { groupsWereNormalized = JSON.stringify(value.printGroups ?? []) !== JSON.stringify(printGroups); } catch { groupsWereNormalized = true; }

  return {
    project: {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      name: cleanString(value.name, 'My cinematic wall', 120),
      pieces: migration.pieces,
      printGroups,
      wall,
      measurementUnit: value.measurementUnit === 'in' ? 'in' : 'cm',
      showWallLabels: value.showWallLabels !== false,
      autoRotatePrint: value.autoRotatePrint !== false,
      printOverrides,
      printRotationOverrides,
      printPaper: typeof value.printPaper === 'string' && PRINT_PAPERS.has(value.printPaper as PrintPaper) ? value.printPaper as PrintPaper : 'A3',
      customSheetW: boundedNumber(value.customSheetW, 32, 10, 200),
      customSheetH: boundedNumber(value.customSheetH, 45, 10, 200),
      printLandscape: value.printLandscape === true,
      printGap: boundedNumber(value.printGap, 0.6, 0, 10),
      printMargin: boundedNumber(value.printMargin, 1, 0, 10),
      cropMarks: value.cropMarks !== false,
      printExportFormat: typeof value.printExportFormat === 'string' && EXPORT_FORMATS.has(value.printExportFormat as PrintExportFormat) ? value.printExportFormat as PrintExportFormat : 'pdf',
      printDpi: value.printDpi === 150 ? 150 : 300,
      posterPreset: typeof value.posterPreset === 'string' && PHOTO_PRESETS.has(value.posterPreset as PhotoSizePreset) ? value.posterPreset as PhotoSizePreset : 'A4',
      sheetPaper: typeof value.sheetPaper === 'string' && SHEET_PAPERS.has(value.sheetPaper as Exclude<PrintPaper, 'Custom'>) ? value.sheetPaper as Exclude<PrintPaper, 'Custom'> : 'A3',
      identity,
      updatedAt: cleanString(value.updatedAt ?? value.savedAt, new Date().toISOString(), 80),
    },
    warnings,
    repairedIds: migration.repairedIds,
    repairedCodes: migration.repairedCodes,
    sourceSchemaVersion,
    needsPersistence: sourceSchemaVersion < PROJECT_SCHEMA_VERSION
      || migration.repairedIds > 0
      || migration.repairedCodes > 0
      || identityWasNormalized
      || groupsWereNormalized
      || restoredLegacyPhotoSource,
  };
}

export function projectImageSources(project: ProjectDocument) {
  const sources = new Set(project.pieces.map((piece) => piece.src));
  if (project.wall.photo) sources.add(project.wall.photo);
  return [...sources];
}

export function approximateProjectBytes(project: ProjectDocument) {
  const imageCharacters = project.pieces.reduce((total, piece) => total + piece.src.length, 0)
    + (project.wall.photo?.length ?? 0);
  const identityCharacters = project.identity.issuedIds.reduce((total, id) => total + id.length + 4, 0)
    + project.identity.issuedCodes.reduce((total, code) => total + code.length + 4, 0);
  const textCharacters = project.pieces.reduce((total, piece) => total + (piece.text?.value.length ?? 0), 0);
  const groupCharacters = project.printGroups.reduce((total, group) => total + group.id.length + group.code.length + group.memberIds.join('').length, 0);
  return imageCharacters + textCharacters * 2 + identityCharacters + groupCharacters * 2 + project.pieces.length * 1_024 + 4_096;
}
