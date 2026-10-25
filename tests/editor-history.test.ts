/* eslint-disable typescript/no-floating-promises */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cloneEditorSnapshot,
  editorSnapshotsEqual,
  pushHistorySnapshot,
  type EditorSnapshot,
} from '../lib/editor-history.ts';
import type { Piece } from '../lib/studio.ts';
import { createTextData, TRANSPARENT_PIXEL } from '../lib/text-elements.ts';

function piece(id = 'photo-a'): Piece {
  return {
    id,
    code: 'P001',
    name: 'Photo A',
    src: 'data:image/png;base64,AAAA',
    widthCm: 12,
    heightCm: 18,
    x: 10,
    y: 12,
    w: 8,
    h: 12,
    rotation: -4,
    placed: true,
    locked: false,
    category: 'Test',
    tone: 'warm',
    color: '#aa5500',
    crop: {
      mode: 'fill',
      zoom: 1.2,
      offsetX: 0.1,
      offsetY: -0.2,
      quarterTurns: 1,
      flipX: true,
      flipY: false,
    },
  };
}

function snapshot(label = 'photo-a'): EditorSnapshot {
  return {
    pieces: [piece(label)],
    printGroups: [],
    wall: {
      widthCm: 250,
      heightCm: 100,
      color: '#f4f1ff',
      photo: 'data:image/jpeg;base64,WALL',
      photoOpacity: 0.8,
      furnitureClearanceCm: 14,
    },
    showWallLabels: true,
    autoRotatePrint: true,
    printOverrides: { [label]: { widthCm: 10, heightCm: 15 } },
    printRotationOverrides: { [label]: -90 },
    printPaper: 'A3',
    customSheetW: 32,
    customSheetH: 45,
    printLandscape: false,
    printGap: 0.6,
    printMargin: 1,
    cropMarks: true,
  };
}

test('snapshot cloning is deep for every mutable editor collection', () => {
  const original = snapshot();
  const cloned = cloneEditorSnapshot(original);

  assert.deepEqual(cloned, original);
  assert.notEqual(cloned, original);
  assert.notEqual(cloned.pieces, original.pieces);
  assert.notEqual(cloned.pieces[0], original.pieces[0]);
  assert.notEqual(cloned.pieces[0].crop, original.pieces[0].crop);
  assert.notEqual(cloned.printGroups, original.printGroups);
  assert.notEqual(cloned.wall, original.wall);
  assert.notEqual(cloned.printOverrides, original.printOverrides);
  assert.notEqual(cloned.printOverrides['photo-a'], original.printOverrides['photo-a']);
  assert.notEqual(cloned.printRotationOverrides, original.printRotationOverrides);

  original.pieces[0].crop!.zoom = 9;
  original.wall.color = '#000000';
  original.printOverrides['photo-a'].widthCm = 99;
  original.printRotationOverrides['photo-a'] = 180;

  assert.equal(cloned.pieces[0].crop!.zoom, 1.2);
  assert.equal(cloned.wall.color, '#f4f1ff');
  assert.equal(cloned.printOverrides['photo-a'].widthCm, 10);
  assert.equal(cloned.printRotationOverrides['photo-a'], -90);
});

test('history preserves the active composition alongside geometry', () => {
  const state = { ...snapshot(), layout: 'salon' as const };
  const history = pushHistorySnapshot([], state);
  assert.equal(history[0].layout, 'salon');
  assert.equal(editorSnapshotsEqual(state, { ...state, layout: 'custom' }), false);
});

test('snapshot cloning owns nested borders and editable text styles', () => {
  const original = snapshot();
  original.printGroups = [{ id: 'group-a', code: 'G001', memberIds: ['photo-a', 'text-a'] }];
  original.pieces[0].border = {
    color: '#635bff',
    thicknessCm: .4,
    edges: { top: true, right: false, bottom: true, left: false },
  };
  original.pieces.push({
    ...piece('text-a'),
    code: 'T001',
    name: 'Hello',
    kind: 'text',
    src: TRANSPARENT_PIXEL,
    text: createTextData('neon-glow', 'Hello'),
  });
  const cloned = cloneEditorSnapshot(original);

  assert.notEqual(cloned.pieces[0].border, original.pieces[0].border);
  assert.notEqual(cloned.pieces[0].border?.edges, original.pieces[0].border?.edges);
  assert.notEqual(cloned.pieces[1].text, original.pieces[1].text);
  assert.notEqual(cloned.pieces[1].text?.style, original.pieces[1].text?.style);
  assert.notEqual(cloned.printGroups[0], original.printGroups[0]);
  assert.notEqual(cloned.printGroups[0].memberIds, original.printGroups[0].memberIds);

  original.pieces[0].border!.edges.top = false;
  original.pieces[1].text!.style.color = '#000000';
  original.printGroups[0].memberIds.pop();
  assert.equal(cloned.pieces[0].border?.edges.top, true);
  assert.equal(cloned.pieces[1].text?.style.color, '#ffffff');
  assert.deepEqual(cloned.printGroups[0].memberIds, ['photo-a', 'text-a']);
});

test('history scope retains output state but drops identity and transient UI fields', () => {
  const extended = Object.assign(snapshot(), {
    identityRegistry: { issuedIds: ['photo-a'] },
    selectedIds: ['photo-a'],
    zoom: 2,
    panelMode: 'inspect',
  });
  const cloned = cloneEditorSnapshot(extended);

  assert.deepEqual(cloned.wall, extended.wall);
  assert.equal(cloned.showWallLabels, true);
  assert.equal(cloned.printPaper, 'A3');
  assert.equal(cloned.printRotationOverrides['photo-a'], -90);
  assert.equal('identityRegistry' in cloned, false);
  assert.equal('selectedIds' in cloned, false);
  assert.equal('zoom' in cloned, false);
  assert.equal('panelMode' in cloned, false);
});

test('snapshot equality ignores record insertion order and detects nested edits', () => {
  const left = snapshot();
  left.printOverrides['photo-b'] = { widthCm: 8, heightCm: 12 };

  const right = snapshot();
  right.printOverrides = {
    'photo-b': { widthCm: 8, heightCm: 12 },
    'photo-a': { widthCm: 10, heightCm: 15 },
  };

  assert.equal(editorSnapshotsEqual(left, right), true);
  right.pieces[0].crop!.offsetX = 0.25;
  assert.equal(editorSnapshotsEqual(left, right), false);
});

test('history push is capped, immutable, and owns the newest snapshot', () => {
  const first = snapshot('photo-1');
  const second = snapshot('photo-2');
  const third = snapshot('photo-3');
  const originalHistory = [first, second];
  const result = pushHistorySnapshot(originalHistory, third, 2);

  assert.deepEqual(result.map(({ pieces }) => pieces[0].id), ['photo-2', 'photo-3']);
  assert.deepEqual(originalHistory.map(({ pieces }) => pieces[0].id), ['photo-1', 'photo-2']);
  assert.notEqual(result[1], third);

  third.wall.widthCm = 999;
  third.pieces[0].crop!.zoom = 8;
  assert.equal(result[1].wall.widthCm, 250);
  assert.equal(result[1].pieces[0].crop!.zoom, 1.2);
  assert.throws(() => pushHistorySnapshot([], snapshot(), 0), RangeError);
});
