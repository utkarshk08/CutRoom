/* eslint-disable typescript/no-floating-promises */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  packPrintItems,
  printPlacementFootprint,
  recommendPrintFit,
  type PrintPackItem,
} from '../lib/studio.ts';

function item(rotationPreference?: PrintPackItem['rotationPreference']): PrintPackItem {
  return {
    instanceId: 'instance-a',
    pieceId: 'piece-a',
    widthCm: 15,
    heightCm: 25,
    order: 0,
    rotationPreference,
  };
}

test('manual -90 degree rotation swaps the footprint even when Smart Rotation is off', () => {
  const result = packPrintItems([item(-90)], 25, 15, 0, 0, { allow90Rotation: false });
  assert.equal(result.unplaced.length, 0);
  assert.equal(result.pages.length, 1);
  const placement = result.pages[0].placements[0];
  assert.equal(placement.sheetRotation, -90);
  assert.equal(placement.widthCm, 15);
  assert.equal(placement.heightCm, 25);
  assert.deepEqual(printPlacementFootprint(placement), { widthCm: 25, heightCm: 15 });
});

test('manual 180 degree rotation is retained without swapping physical dimensions', () => {
  const result = packPrintItems([item(180)], 15, 25, 0, 0, { allow90Rotation: true });
  assert.equal(result.unplaced.length, 0);
  const placement = result.pages[0].placements[0];
  assert.equal(placement.sheetRotation, 180);
  assert.deepEqual(printPlacementFootprint(placement), { widthCm: 15, heightCm: 25 });

  const swappedOnlySheet = packPrintItems([item(180)], 25, 15, 0, 0, { allow90Rotation: true });
  assert.equal(swappedOnlySheet.pages.length, 0);
  assert.deepEqual(swappedOnlySheet.unplaced.map(({ pieceId }) => pieceId), ['piece-a']);
});

test('Smart Rotation chooses only 0 or 90 while explicit orientation always wins', () => {
  const automatic = packPrintItems([item()], 25, 15, 0, 0, { allow90Rotation: true });
  assert.equal(automatic.pages[0].placements[0].sheetRotation, 90);
  assert.ok(automatic.pages.flatMap(({ placements }) => placements).every(({ sheetRotation }) => sheetRotation === 0 || sheetRotation === 90));

  const disabled = packPrintItems([item()], 25, 15, 0, 0, { allow90Rotation: false });
  assert.equal(disabled.pages.length, 0);
  assert.equal(disabled.unplaced.length, 1);

  const manual = packPrintItems([item(-90)], 25, 15, 0, 0, { allow90Rotation: true });
  assert.equal(manual.pages[0].placements[0].sheetRotation, -90);
});

test('best-fit recommendation keeps proportions and chooses the largest allowed orientation', () => {
  const automatic = recommendPrintFit({ widthCm: 30, heightCm: 20 }, 21, 29.7, 1, true);
  assert.equal(automatic.sheetRotation, 90);
  assert.ok(Math.abs(automatic.widthCm / automatic.heightCm - 1.5) < 0.0001);
  assert.ok(Math.abs(automatic.scale - 27.7 / 30) < 0.0001);

  const explicit = recommendPrintFit({ widthCm: 30, heightCm: 20, rotationPreference: 180 }, 21, 29.7, 1, true);
  assert.equal(explicit.sheetRotation, 180);
  assert.ok(Math.abs(explicit.widthCm - 19) < 0.0001);
  assert.ok(Math.abs(explicit.heightCm - 12.6666666667) < 0.0001);
});
