/* eslint-disable typescript/no-floating-promises */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  allocateCopyIdentity,
  allocatePhotoIdentities,
  allocatePrintGroupIdentity,
  allocateSheetIdentities,
  allocateTextIdentity,
  approximateProjectBytes,
  createIdentityRegistry,
  PROJECT_SCHEMA_VERSION,
  validateProjectDocument,
  type ProjectDocument,
} from '../lib/project-document.ts';
import type { Piece } from '../lib/studio.ts';
import { createTextData, TRANSPARENT_PIXEL } from '../lib/text-elements.ts';

const source = 'data:image/png;base64,AAAA';

function piece(id = 'id-a', code = 'P001'): Piece {
  return {
    id,
    code,
    name: code,
    src: source,
    widthCm: 20,
    heightCm: 30,
    x: 10,
    y: 10,
    w: 10,
    h: 15,
    rotation: 0,
    placed: true,
    locked: false,
    category: 'Test',
    tone: 'neutral',
    color: '#123456',
  };
}

function project(pieces = [piece()]): ProjectDocument {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    name: 'Test project',
    pieces,
    printGroups: [],
    wall: { widthCm: 200, heightCm: 200, color: '#eeeeee', photoOpacity: 0.8, furnitureClearanceCm: 0 },
    measurementUnit: 'cm',
    showWallLabels: true,
    autoRotatePrint: true,
    printOverrides: {},
    printRotationOverrides: {},
    printPaper: 'A3',
    customSheetW: 32,
    customSheetH: 45,
    printLandscape: false,
    printGap: 0.6,
    printMargin: 1,
    cropMarks: true,
    printExportFormat: 'pdf',
    printDpi: 300,
    posterPreset: 'A4',
    sheetPaper: 'A3',
    identity: createIdentityRegistry(pieces),
    updatedAt: '2026-09-10T00:00:00.000Z',
  };
}

function mint(prefix = 'mint') {
  let number = 0;
  return () => `${prefix}-${++number}`;
}

test('current-schema repair changes only the missing or repeated identity', () => {
  const input = project([piece('keep-a', 'P001'), piece('keep-b', 'P002'), piece('repeat', 'P003')]);
  (input.pieces[1] as unknown as { code?: string }).code = undefined;
  input.pieces[2].id = 'keep-a';
  input.pieces[2].code = 'P001';

  const result = validateProjectDocument(input, { mintId: mint() });
  assert.equal(result.project.pieces[0].id, 'keep-a');
  assert.equal(result.project.pieces[0].code, 'P001');
  assert.equal(result.project.pieces[1].id, 'keep-b');
  assert.notEqual(result.project.pieces[1].code, 'P002');
  assert.equal(new Set(result.project.pieces.map(({ id }) => id)).size, 3);
  assert.equal(new Set(result.project.pieces.map(({ code }) => code)).size, 3);
  assert.equal(result.repairedIds, 1);
  assert.equal(result.repairedCodes, 2);
});

test('v4 migration keeps visible labels and remaps print settings to immutable IDs', () => {
  const oldPiece = piece('S13-01', 'unused');
  const input = {
    ...project([oldPiece]),
    schemaVersion: 4,
    pieces: [{ ...oldPiece, code: undefined }],
    identity: undefined,
    printOverrides: { 'S13-01': { widthCm: 12, heightCm: 18 } },
    printRotationOverrides: { 'S13-01': 90 },
  };
  const result = validateProjectDocument(input, { mintId: mint('uuid') });
  const migrated = result.project.pieces[0];
  assert.equal(migrated.code, 'S13-01');
  assert.equal(migrated.id, 'uuid-1');
  assert.deepEqual(result.project.printOverrides[migrated.id], { widthCm: 12, heightCm: 18 });
  assert.equal(result.project.printRotationOverrides[migrated.id], 90);
});

test('v1 migration preserves its original canvas geometry', () => {
  const oldPiece = { ...piece('S01-01', 'S01-01'), widthCm: 1, heightCm: 1, w: 25, h: 30 };
  const input = { ...project([oldPiece]), schemaVersion: 1, pieces: [oldPiece], wall: { widthCm: 200, heightCm: 100, color: '#eeeeee', furnitureClearanceCm: 0 } };
  const migrated = validateProjectDocument(input, { mintId: mint() }).project.pieces[0];
  assert.equal(migrated.widthCm, 50);
  assert.equal(migrated.heightCm, 30);
  assert.equal(migrated.w, 25);
  assert.equal(migrated.h, 30);
});

test('deleted labels remain tombstoned after reload and are never reused', () => {
  const registry = createIdentityRegistry([piece('a', 'P001')], {
    issuedIds: ['a', 'deleted-b'],
    issuedCodes: ['P001', 'P002'],
  });
  const restored = validateProjectDocument({ ...project([piece('a', 'P001')]), identity: registry }, { mintId: mint() }).project;
  const added = allocatePhotoIdentities(restored.identity, 1, mint('photo'));
  assert.equal(added.identities[0].code, 'P003');
  assert.equal(added.identities[0].id, 'photo-1');

  const firstSheet = allocateSheetIdentities(added.registry, 2, mint('sheet'));
  const reloadedRegistry = createIdentityRegistry([], firstSheet.registry);
  const secondSheet = allocateSheetIdentities(reloadedRegistry, 1, mint('next-sheet'));
  assert.notEqual(secondSheet.identities[0].code, firstSheet.identities[0].code);
  assert.equal(new Set([...firstSheet.registry.issuedCodes, ...secondSheet.registry.issuedCodes]).size, secondSheet.registry.issuedCodes.length);
});

test('hostile counters and reserved object keys cannot break duplication', () => {
  const reservedPiece = piece('id-constructor', 'constructor');
  const input = project([reservedPiece]);
  input.identity = {
    ...input.identity,
    nextPhoto: Number.MAX_SAFE_INTEGER,
    nextSheet: Number.MAX_SAFE_INTEGER,
    copyCounters: { constructor: Number.MAX_SAFE_INTEGER },
  };
  const restored = validateProjectDocument(input, { mintId: mint() }).project;
  const first = allocateCopyIdentity(restored.identity, 'constructor', mint('copy'));
  const second = allocateCopyIdentity(first.registry, 'constructor', mint('copy-next'));
  assert.equal(first.identity.code, 'constructor-C01');
  assert.equal(second.identity.code, 'constructor-C02');
  assert.notEqual(first.identity.id, second.identity.id);
});

test('copy labels remain stable after reload even for maximum-length source labels', () => {
  const longCode = 'x'.repeat(96);
  const initial = createIdentityRegistry([piece('long-id', longCode)]);
  const copied = allocateCopyIdentity(initial, longCode, mint('long-copy'));
  assert.ok(copied.identity.code.length <= 96);
  const restored = validateProjectDocument(project([
    piece('long-id', longCode),
    piece(copied.identity.id, copied.identity.code),
  ]), { mintId: mint('repair') });
  assert.equal(restored.repairedCodes, 0);
  assert.equal(restored.project.pieces[1].code, copied.identity.code);
});

test('a canonical current-schema project validates idempotently', () => {
  const first = validateProjectDocument(project(), { mintId: mint() });
  const second = validateProjectDocument(first.project, { mintId: mint('again') });
  assert.deepEqual(second.project.pieces.map(({ id, code }) => ({ id, code })), first.project.pieces.map(({ id, code }) => ({ id, code })));
  assert.equal(second.needsPersistence, false);
});

test('older migration preserves stable photo identities and adds newer counters safely', () => {
  const current = project([piece('stable-id', 'P007')]);
  const input = {
    ...current,
    schemaVersion: 5,
    identity: {
      version: 1,
      issuedIds: ['stable-id'],
      issuedCodes: ['P007'],
      nextPhoto: 8,
      nextSheet: 13,
      copyCounters: {},
    },
  };
  const restored = validateProjectDocument(input, { mintId: mint('must-not-run') });
  assert.equal(restored.project.pieces[0].id, 'stable-id');
  assert.equal(restored.project.pieces[0].code, 'P007');
  assert.equal(restored.repairedIds, 0);
  assert.equal(restored.repairedCodes, 0);
  assert.equal(restored.project.identity.nextText, 1);
  assert.equal(restored.project.identity.nextGroup, 1);
  assert.equal(restored.project.wall.photoOpacity, 0.8);
});

test('text identities remain unique across save, reload, delete, and duplication', () => {
  const textPiece: Piece = {
    ...piece('text-id', 'T001'),
    kind: 'text',
    text: createTextData('bold-headline', 'Hello wall'),
    src: TRANSPARENT_PIXEL,
    name: 'Hello wall',
    category: 'Text',
  };
  const restored = validateProjectDocument(project([textPiece]), { mintId: mint('repair') }).project;
  assert.equal(restored.pieces[0].kind, 'text');
  assert.equal(restored.pieces[0].text?.value, 'Hello wall');

  const next = allocateTextIdentity(restored.identity, mint('text'));
  assert.equal(next.identity.code, 'T002');
  const copied = allocateCopyIdentity(next.registry, 'T001', mint('copy'));
  assert.equal(copied.identity.code, 'T001-C01');
  const reloaded = createIdentityRegistry([], copied.registry);
  const afterDelete = allocateTextIdentity(reloaded, mint('text-after-delete'));
  assert.equal(afterDelete.identity.code, 'T003');
});

test('print groups, their overrides, and their rotations survive a canonical reload', () => {
  const pieces = [piece('photo-a', 'P001'), piece('photo-b', 'P002')];
  const input = project(pieces);
  const allocated = allocatePrintGroupIdentity(input.identity, mint('group'));
  input.identity = allocated.registry;
  input.printGroups = [{ ...allocated.identity, memberIds: pieces.map(({ id }) => id) }];
  input.printOverrides[allocated.identity.id] = { widthCm: 18, heightCm: 12 };
  input.printRotationOverrides[allocated.identity.id] = -90;

  const restored = validateProjectDocument(input, { mintId: mint('repair') });
  assert.deepEqual(restored.project.printGroups, input.printGroups);
  assert.deepEqual(restored.project.printOverrides[allocated.identity.id], { widthCm: 18, heightCm: 12 });
  assert.equal(restored.project.printRotationOverrides[allocated.identity.id], -90);
  assert.equal(restored.project.identity.nextGroup, 2);
  assert.equal(restored.needsPersistence, false);
});

test('unsafe or ambiguous print groups are discarded without stealing photo identities', () => {
  const pieces = [piece('photo-a', 'P001'), piece('photo-b', 'P002'), piece('photo-c', 'P003')];
  const input = project(pieces);
  input.printGroups = [
    { id: 'photo-a', code: 'G001', memberIds: ['photo-a', 'photo-b'] },
    { id: 'group-b', code: 'P002', memberIds: ['photo-a', 'photo-b'] },
    { id: 'group-c', code: 'G003', memberIds: ['photo-a', 'photo-b'] },
    { id: 'group-d', code: 'G004', memberIds: ['photo-b', 'photo-c'] },
  ];

  const restored = validateProjectDocument(input, { mintId: mint('repair') }).project;
  assert.deepEqual(restored.printGroups, [{ id: 'group-c', code: 'G003', memberIds: ['photo-a', 'photo-b'] }]);
});

test('room background opacity is sanitized and restored safely', () => {
  const input = project();
  input.wall.photoOpacity = 2;
  const restored = validateProjectDocument(input, { mintId: mint('repair') }).project;
  assert.equal(restored.wall.photoOpacity, 1);
});

test('projects touched by the removed photo-background experiment restore their original source', () => {
  const input = project();
  Object.assign(input.pieces[0] as unknown as Record<string, unknown>, {
    src: 'data:image/png;base64,TRANSPARENT_EDIT',
    pixelW: 900,
    pixelH: 600,
    originalSrc: 'data:image/jpeg;base64,ORIGINAL',
    originalPixelW: 4000,
    originalPixelH: 3000,
  });
  const result = validateProjectDocument(input, { mintId: mint('repair') });
  const restored = result.project.pieces[0];
  assert.equal(restored.src, 'data:image/jpeg;base64,ORIGINAL');
  assert.equal(restored.pixelW, 4000);
  assert.equal(restored.pixelH, 3000);
  assert.equal('originalSrc' in restored, false);
  assert.equal(result.needsPersistence, true);
});

test('print-sheet rotations round-trip all supported orientations and discard invalid entries', () => {
  const pieces = [
    piece('negative', 'P001'),
    piece('zero', 'P002'),
    piece('positive', 'P003'),
    piece('half-turn', 'P004'),
    piece('invalid', 'P005'),
    piece('string', 'P006'),
  ];
  const input = project(pieces);
  (input as unknown as { printRotationOverrides: Record<string, unknown> }).printRotationOverrides = {
    negative: -90,
    zero: 0,
    positive: 90,
    'half-turn': 180,
    invalid: 270,
    string: '90',
    deleted: 90,
  };

  const restored = validateProjectDocument(JSON.parse(JSON.stringify(input)), { mintId: mint('rotation') }).project;
  assert.deepEqual(restored.printRotationOverrides, {
    negative: -90,
    zero: 0,
    positive: 90,
    'half-turn': 180,
  });

  const repeated = validateProjectDocument(restored, { mintId: mint('again') });
  assert.deepEqual(repeated.project.printRotationOverrides, restored.printRotationOverrides);
  assert.equal(repeated.needsPersistence, false);
});

test('unsafe image sources and future schemas are rejected', () => {
  assert.throws(() => validateProjectDocument({ ...project(), pieces: [{ ...piece(), src: 'javascript:alert(1)' }] }), /unsafe or unsupported/);
  assert.throws(() => validateProjectDocument({ ...project(), schemaVersion: PROJECT_SCHEMA_VERSION + 1 }), /newer version/);
});

test('backup size estimate counts duplicated embedded sources', () => {
  const one = approximateProjectBytes(project([piece('a', 'P001')]));
  const two = approximateProjectBytes(project([piece('a', 'P001'), piece('b', 'P002')]));
  assert.ok(two > one + source.length);
});
