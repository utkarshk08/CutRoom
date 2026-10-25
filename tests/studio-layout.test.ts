/* eslint-disable typescript/no-floating-promises */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyCustomLayout,
  applyLayout,
  buildLayoutUnits,
  piecesOverlap,
  type LayoutName,
  type Piece,
  type PrintGroup,
  type Wall,
} from '../lib/studio.ts';
import { createTextData, TRANSPARENT_PIXEL } from '../lib/text-elements.ts';

const wall: Wall = {
  widthCm: 250,
  heightCm: 100,
  color: '#ffffff',
  photoOpacity: 0.8,
  furnitureClearanceCm: 0,
};

function piece(id: string, placed: boolean, locked = false): Piece {
  return {
    id,
    code: id.toUpperCase(),
    name: id,
    src: `data:image/png;base64,${id}`,
    widthCm: 10,
    heightCm: 15,
    x: placed ? 12 : 73,
    y: placed ? 17 : 68,
    w: 4,
    h: 15,
    rotation: placed ? 7 : -13,
    placed,
    locked,
    category: 'Test',
    tone: 'neutral',
    color: '#777777',
    zIndex: placed ? 2 : 99,
  };
}

function assertClose(actual: number, expected: number, message?: string) {
  assert.ok(Math.abs(actual - expected) < 0.000001, message ?? `${actual} should equal ${expected}`);
}

function assertOnlyTranslated(before: Piece, after: Piece) {
  assert.deepEqual({ ...after, x: before.x, y: before.y }, before);
}

const layouts: LayoutName[] = ['salon', 'organic', 'strip', 'diamond', 'flow', 'compass'];

for (const layout of layouts) {
  test(`${layout} composition leaves loose project photos completely untouched`, () => {
    const onWall = piece('wall-photo', true);
    const loose = piece('loose-photo', false);
    const locked = piece('locked-photo', true, true);
    const text: Piece = {
      ...piece('wall-text', true),
      code: 'T001',
      kind: 'text',
      src: TRANSPARENT_PIXEL,
      text: createTextData('bold-headline', 'Do not move me'),
    };
    const result = applyLayout([onWall, loose, locked, text], layout, wall, 58);

    assert.deepEqual(result.find(({ id }) => id === loose.id), loose);
    assert.deepEqual(result.find(({ id }) => id === locked.id), locked);
    assert.deepEqual(result.find(({ id }) => id === text.id), text);
    assert.equal(result.find(({ id }) => id === onWall.id)?.placed, true);
  });

  test(`${layout} result is not influenced by extra loose photos`, () => {
    const first = piece('wall-a', true);
    const second = { ...piece('wall-b', true), x: 42, y: 44, widthCm: 15, heightCm: 10, w: 6, h: 10 };
    const loose = piece('loose-photo', false);

    const withoutLoose = applyLayout([first, second], layout, wall, 58);
    const withLoose = applyLayout([first, second, loose], layout, wall, 58);

    assert.deepEqual(withLoose.slice(0, 2), withoutLoose);
    assert.deepEqual(withLoose[2], loose);
  });
}

test('grouping balance changes position order without changing physical photo sizes', () => {
  const items = [
    { ...piece('warm-adventure', true), category: 'Adventure', tone: 'warm' as const },
    { ...piece('warm-cinema', true), category: 'Cinema', tone: 'warm' as const },
    { ...piece('cool-adventure', true), category: 'Adventure', tone: 'cool' as const },
    { ...piece('cool-cinema', true), category: 'Cinema', tone: 'cool' as const },
  ];
  const contrastLed = applyLayout(items, 'salon', wall, 58, 20);
  const themeLed = applyLayout(items, 'salon', wall, 58, 80);

  assert.notDeepEqual(
    contrastLed.map(({ id, x, y }) => ({ id, x, y })),
    themeLed.map(({ id, x, y }) => ({ id, x, y })),
  );
  themeLed.forEach((result) => {
    const original = items.find(({ id }) => id === result.id);
    assert.equal(result.widthCm, original?.widthCm);
    assert.equal(result.heightCm, original?.heightCm);
    assert.equal(result.w, original?.w);
    assert.equal(result.h, original?.h);
  });
});

test('buildLayoutUnits collapses overlapping wall members into one measured unit and omits tray pieces', () => {
  const first = {
    ...piece('group-first', true),
    x: 10,
    y: 20,
    w: 8,
    h: 10,
    widthCm: 20,
    heightCm: 10,
    rotation: 0,
  };
  const second = {
    ...piece('group-second', true),
    x: 16,
    y: 25,
    w: 4,
    h: 15,
    widthCm: 10,
    heightCm: 15,
    rotation: 0,
  };
  const lone = { ...piece('lone', true), x: 72, y: 60 };
  const tray = piece('tray', false);
  const group: PrintGroup = {
    id: 'rigid-group',
    code: 'G001',
    memberIds: [first.id, second.id, tray.id],
  };

  const units = buildLayoutUnits([first, second, lone, tray], [group], wall);

  assert.deepEqual(units.map(({ id }) => id), [group.id, lone.id]);
  const grouped = units[0];
  assert.equal(grouped.kind, 'group');
  assert.equal(grouped.hasPhoto, true);
  assert.equal(grouped.locked, false);
  assert.deepEqual(grouped.memberIds, [first.id, second.id]);
  assert.deepEqual(grouped.memberCodes, [first.code, second.code]);
  assert.deepEqual(
    {
      x: grouped.proxy.x,
      y: grouped.proxy.y,
      w: grouped.proxy.w,
      h: grouped.proxy.h,
      widthCm: grouped.proxy.widthCm,
      heightCm: grouped.proxy.heightCm,
    },
    { x: 10, y: 20, w: 10, h: 20, widthCm: 25, heightCm: 20 },
  );
});

test('applyLayout treats a group as one rigid unit without changing member geometry or content', () => {
  const first = {
    ...piece('layout-first', true),
    x: 4,
    y: 7,
    rotation: 8,
    zIndex: 3,
  };
  const second = {
    ...piece('layout-second', true),
    x: 10,
    y: 13,
    w: 6,
    h: 10,
    widthCm: 15,
    heightCm: 10,
    rotation: -6,
    zIndex: 8,
  };
  const other = { ...piece('layout-other', true), x: 75, y: 60, rotation: 0 };
  const group: PrintGroup = { id: 'layout-group', code: 'G002', memberIds: [first.id, second.id] };

  const result = applyLayout([first, second, other], 'salon', wall, 58, 50, [group]);
  const movedFirst = result.find(({ id }) => id === first.id)!;
  const movedSecond = result.find(({ id }) => id === second.id)!;
  const firstDx = movedFirst.x - first.x;
  const firstDy = movedFirst.y - first.y;

  assert.ok(Math.abs(firstDx) > 0.000001 || Math.abs(firstDy) > 0.000001, 'the group should be arranged');
  assertClose(movedSecond.x - second.x, firstDx, 'all group members should receive the same x translation');
  assertClose(movedSecond.y - second.y, firstDy, 'all group members should receive the same y translation');
  assertClose(movedSecond.x - movedFirst.x, second.x - first.x, 'the internal x offset should stay exact');
  assertClose(movedSecond.y - movedFirst.y, second.y - first.y, 'the internal y offset should stay exact');
  assertOnlyTranslated(first, movedFirst);
  assertOnlyTranslated(second, movedSecond);
});

test('applyCustomLayout moves grouped photo and text together while preserving text and overlap', () => {
  const photo = {
    ...piece('custom-photo', true),
    x: 8,
    y: 12,
    w: 8,
    h: 18,
    widthCm: 20,
    heightCm: 18,
    rotation: 3,
    zIndex: 4,
  };
  const text: Piece = {
    ...piece('custom-text', true),
    code: 'T001',
    kind: 'text',
    src: TRANSPARENT_PIXEL,
    text: createTextData('bold-headline', 'Keep me attached'),
    x: 13,
    y: 17,
    w: 10,
    h: 8,
    widthCm: 25,
    heightCm: 8,
    rotation: -4,
    zIndex: 9,
  };
  const group: PrintGroup = { id: 'mixed-group', code: 'G003', memberIds: [photo.id, text.id] };

  const result = applyCustomLayout(
    [photo, text],
    [{ unitId: group.id, centerXPercent: 72, centerYPercent: 62 }],
    wall,
    58,
    [group],
  );
  const movedPhoto = result.find(({ id }) => id === photo.id)!;
  const movedText = result.find(({ id }) => id === text.id)!;
  const photoDx = movedPhoto.x - photo.x;
  const photoDy = movedPhoto.y - photo.y;

  assert.ok(Math.abs(photoDx) > 0.000001 || Math.abs(photoDy) > 0.000001, 'the mixed group should move');
  assertClose(movedText.x - text.x, photoDx);
  assertClose(movedText.y - text.y, photoDy);
  assertClose(movedText.x - movedPhoto.x, text.x - photo.x);
  assertClose(movedText.y - movedPhoto.y, text.y - photo.y);
  assertOnlyTranslated(photo, movedPhoto);
  assertOnlyTranslated(text, movedText);
});

test('a locked member freezes its entire group for template and custom layouts', () => {
  const unlocked = { ...piece('anchored-unlocked', true), x: 8, y: 8 };
  const locked = { ...piece('anchored-locked', true, true), x: 15, y: 14 };
  const group: PrintGroup = { id: 'anchored-group', code: 'G004', memberIds: [unlocked.id, locked.id] };

  const units = buildLayoutUnits([unlocked, locked], [group], wall);
  assert.equal(units.length, 1);
  assert.equal(units[0].locked, true);

  const templated = applyLayout([unlocked, locked], 'organic', wall, 58, 50, [group]);
  const custom = applyCustomLayout(
    [unlocked, locked],
    [{ unitId: group.id, centerXPercent: 80, centerYPercent: 75 }],
    wall,
    58,
    [group],
  );

  assert.deepEqual(templated, [unlocked, locked]);
  assert.deepEqual(custom, [unlocked, locked]);
});

test('custom layouts leave ungrouped text fixed and ignore targets for tray pieces', () => {
  const photo = { ...piece('custom-wall-photo', true), x: 5, y: 5, rotation: 0 };
  const text: Piece = {
    ...piece('fixed-wall-text', true),
    code: 'T002',
    kind: 'text',
    src: TRANSPARENT_PIXEL,
    text: createTextData('bold-headline', 'Stay here'),
    x: 46,
    y: 42,
    rotation: 0,
  };
  const tray = piece('custom-tray-photo', false);

  const result = applyCustomLayout(
    [photo, text, tray],
    [
      { unitId: photo.id, centerXPercent: 78, centerYPercent: 75 },
      { unitId: text.id, centerXPercent: 10, centerYPercent: 10 },
      { unitId: tray.id, centerXPercent: 20, centerYPercent: 20 },
    ],
    wall,
  );

  assert.notDeepEqual(result[0], photo);
  assert.deepEqual(result[1], text);
  assert.deepEqual(result[2], tray);
});

test('crowded but feasible wall stays collision-free in every composition and custom layout', () => {
  const squareWall = { ...wall, widthCm: 100, heightCm: 100 };
  const originals = [0, 51].map((x, index) => ({
    ...piece(`wide-${index}`, true),
    x, y: 0, w: 49, h: 90, widthCm: 49, heightCm: 90, rotation: 0,
  }));
  assert.equal(piecesOverlap(originals[0], originals[1], squareWall), false);
  const before = structuredClone(originals);
  const results = layouts.map((layout) => applyLayout(originals, layout, squareWall, 58));
  results.push(applyCustomLayout(originals, originals.map(({ id }) => ({
    unitId: id, centerXPercent: 50, centerYPercent: 50,
  })), squareWall, 58));
  for (const result of results) {
    assert.equal(piecesOverlap(result[0], result[1], squareWall), false);
    result.forEach((item, index) => {
      assertOnlyTranslated(originals[index], item);
      assert.ok(item.x >= 0 && item.y >= 0 && item.x + item.w <= 100 && item.y + item.h <= 100);
    });
  }
  assert.deepEqual(originals, before, 'search attempts never mutate the input');
});

test('tight grouped photo and text stay rigid without colliding with another large item', () => {
  const squareWall = { ...wall, widthCm: 100, heightCm: 100 };
  const photo = { ...piece('large-photo', true), x: 0, y: 0, w: 49, h: 90, widthCm: 49, heightCm: 90, rotation: 0 };
  const caption: Piece = { ...piece('caption', true), kind: 'text', x: 5, y: 10, w: 20, h: 10, widthCm: 20, heightCm: 10, rotation: 0, text: createTextData('bold-headline', 'Together') };
  const other = { ...photo, id: 'other', code: 'OTHER', x: 51 };
  const group = { id: 'group', code: 'G001', memberIds: [photo.id, caption.id] };
  const originals = [photo, caption, other];
  const result = applyLayout(originals, 'salon', squareWall, 58, 50, [group]);
  assert.equal(piecesOverlap(result[0], result[2], squareWall), false);
  assertClose(result[1].x - result[0].x, caption.x - photo.x);
  assertClose(result[1].y - result[0].y, caption.y - photo.y);
  result.forEach((item, index) => assertOnlyTranslated(originals[index], item));
});

test('invalid custom targets fail without changing the wall', () => {
  const originals = [piece('invalid-target', true)];
  const before = structuredClone(originals);
  assert.throws(() => applyCustomLayout(originals, [{ unitId: originals[0].id, centerXPercent: Number.NaN, centerYPercent: 50 }], wall), /arrangement/i);
  assert.deepEqual(originals, before);
});

test('overlapping envelopes of separate angled photos do not exempt new actual collisions', () => {
  const squareWall = { ...wall, widthCm: 100, heightCm: 100 };
  const originals = [
    [41.18, 12.62, 43.65, 22.13], [34.71, 11.21, 33.29, 65.1],
    [32.03, 16.96, 13.21, 34.09], [44.39, 8.12, 7.06, 61.69],
    [33.75, 12.61, 59.53, 54.02],
  ].map(([w, h, x, y], index) => ({
    ...piece(`${[1, 2, 3, 5, 6][index]}`, true), w, h, x, y, widthCm: w, heightCm: h, rotation: 45,
  }));
  const before = structuredClone(originals);
  const assertClear = (items: Piece[]) => items.forEach((a, i) => items.slice(i + 1).forEach((b) => {
    assert.equal(piecesOverlap(a, b, squareWall), false, `${a.id} and ${b.id} must remain separate`);
  }));
  assertClear(originals);
  for (const layout of layouts) {
    try {
      const result = applyLayout(originals, layout, squareWall, 58);
      assertClear(result);
      result.forEach((item, index) => assertOnlyTranslated(originals[index], item));
    } catch (error) {
      // A dense proposal may be rejected, but must never commit a collision.
      assert.match((error as Error).message, /^This arrangement would add overlaps/);
    }
    assert.deepEqual(originals, before);
  }
});
