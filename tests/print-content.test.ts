/* eslint-disable typescript/no-floating-promises */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPrintContents,
  groupIdsForMembers,
  removeMembersFromPrintGroups,
  scaleAllPrintContents,
  uniformPrintScalePercent,
} from '../lib/print-content.ts';
import type { Piece, PrintGroup, Wall } from '../lib/studio.ts';
import { createTextData, TRANSPARENT_PIXEL } from '../lib/text-elements.ts';

const wall: Wall = {
  widthCm: 100,
  heightCm: 100,
  color: '#ffffff',
  photoOpacity: 0.8,
  furnitureClearanceCm: 0,
};

function piece(id: string, x: number, y: number, widthCm: number, heightCm: number, rotation = 0): Piece {
  return {
    id,
    code: id.toUpperCase(),
    name: id,
    src: 'data:image/png;base64,AAAA',
    widthCm,
    heightCm,
    x,
    y,
    w: widthCm,
    h: heightCm,
    rotation,
    placed: true,
    locked: false,
    category: 'Test',
    tone: 'neutral',
    color: '#777777',
  };
}

test('a mixed text and photo group becomes one print item and preserves wall layer order', () => {
  const photo = piece('photo-a', 10, 20, 20, 10);
  const text: Piece = {
    ...piece('text-a', 25, 22, 10, 10),
    kind: 'text',
    src: TRANSPARENT_PIXEL,
    text: { ...createTextData('bold-headline', 'OVER'), printable: false },
  };
  const group: PrintGroup = { id: 'group-a', code: 'G001', memberIds: [text.id, photo.id] };

  const contents = buildPrintContents([photo, text], [group], wall);
  assert.equal(contents.length, 1);
  assert.equal(contents[0].id, group.id);
  assert.equal(contents[0].kind, 'group');
  assert.deepEqual(contents[0].memberIds, [photo.id, text.id]);
  assert.deepEqual(contents[0].members.map(({ pieceId }) => pieceId), [photo.id, text.id]);
  assert.equal(contents[0].widthCm, 25);
  assert.equal(contents[0].heightCm, 12);
});

test('ungrouped non-printable text stays out, while ordinary photos remain separate', () => {
  const photo = piece('photo-a', 10, 20, 20, 10);
  const text: Piece = {
    ...piece('text-a', 25, 22, 10, 10),
    kind: 'text',
    src: TRANSPARENT_PIXEL,
    text: { ...createTextData('bold-headline', 'OVER'), printable: false },
  };
  const contents = buildPrintContents([photo, text], [], wall);
  assert.deepEqual(contents.map(({ id }) => id), [photo.id]);
});

test('rotated member bounds become the composite physical trim bounds', () => {
  const rotated = piece('rotated', 10, 20, 20, 10, 90);
  const contents = buildPrintContents([
    rotated,
    piece('anchor', 30, 20, 10, 10),
  ], [{ id: 'group-a', code: 'G001', memberIds: ['rotated', 'anchor'] }], wall);
  assert.equal(contents.length, 1);
  assert.ok(Math.abs(contents[0].widthCm - 25) < 0.0001);
  assert.ok(Math.abs(contents[0].heightCm - 20) < 0.0001);
  assert.equal(contents[0].members[0].rotation, 90);
});

test('group membership utilities find groups and dissolve groups with fewer than two members', () => {
  const groups: PrintGroup[] = [
    { id: 'group-a', code: 'G001', memberIds: ['a', 'b', 'c'] },
    { id: 'group-b', code: 'G002', memberIds: ['d', 'e'] },
  ];
  assert.deepEqual(groupIdsForMembers(groups, ['c', 'z']), ['group-a']);
  assert.deepEqual(removeMembersFromPrintGroups(groups, ['a']), [
    { id: 'group-a', code: 'G001', memberIds: ['b', 'c'] },
    { id: 'group-b', code: 'G002', memberIds: ['d', 'e'] },
  ]);
  assert.deepEqual(removeMembersFromPrintGroups(groups, ['a', 'b', 'd']), []);
});

test('global Print Pack scaling preserves every item ratio and relative size', () => {
  const contents = buildPrintContents([
    piece('small', 0, 0, 10, 20),
    piece('wide', 20, 0, 30, 10),
  ], [], wall);
  const overrides = scaleAllPrintContents(contents, 125);
  assert.deepEqual(overrides.small, { widthCm: 12.5, heightCm: 25 });
  assert.deepEqual(overrides.wide, { widthCm: 37.5, heightCm: 12.5 });
  assert.equal(uniformPrintScalePercent(contents, overrides), 125);
  assert.deepEqual(scaleAllPrintContents(contents, 100), {});
});

test('global Print Pack scale reports mixed after an individual size edit', () => {
  const contents = buildPrintContents([
    piece('small', 0, 0, 10, 20),
    piece('wide', 20, 0, 30, 10),
  ], [], wall);
  assert.equal(uniformPrintScalePercent(contents, {
    small: { widthCm: 12, heightCm: 24 },
    wide: { widthCm: 30, heightCm: 10 },
  }), null);
  assert.equal(uniformPrintScalePercent(contents, {
    small: { widthCm: 12, heightCm: 20 },
  }), null);
});
