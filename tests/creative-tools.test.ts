/* eslint-disable typescript/no-floating-promises */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  borderEdgesForPreset,
  borderPresetForEdges,
  normalizePhotoBorder,
  photoBorderRects,
} from '../lib/photo-border.ts';
import {
  createTextData,
  measureTextBoxSize,
  sanitizeTextData,
  TEXT_PRESETS,
} from '../lib/text-elements.ts';

test('text library contains at least twenty distinct, editable style presets', () => {
  assert.ok(TEXT_PRESETS.length >= 20);
  assert.equal(new Set(TEXT_PRESETS.map(({ id }) => id)).size, TEXT_PRESETS.length);
  assert.equal(new Set(TEXT_PRESETS.map(({ name }) => name)).size, TEXT_PRESETS.length);
  TEXT_PRESETS.forEach((preset) => {
    const created = createTextData(preset.id);
    assert.equal(created.presetId, preset.id);
    assert.notEqual(created.style, preset.style);
  });
});

test('new and restored text boxes have no automatic inner padding', () => {
  const created = createTextData('clean-sans');
  assert.equal('paddingCm' in created.style, false);
  const restored = sanitizeTextData({
    ...created,
    style: { ...created.style, paddingCm: 4 },
  });
  assert.ok(restored);
  assert.equal('paddingCm' in restored.style, false);
});

test('text boxes tightly follow their font size and content', () => {
  const short = createTextData('clean-sans', 'Hi');
  const long = createTextData('clean-sans', 'A much longer title');
  const multiline = createTextData('clean-sans', 'First\nSecond');
  const shortSize = measureTextBoxSize(short, 100);
  const longSize = measureTextBoxSize(long, 100);
  const multilineSize = measureTextBoxSize(multiline, 100);
  const fontHeightCm = short.style.fontSizePt * 2.54 / 72;

  assert.ok(shortSize.heightCm >= fontHeightCm);
  assert.ok(shortSize.heightCm < fontHeightCm + .1);
  assert.ok(longSize.widthCm > shortSize.widthCm);
  assert.ok(multilineSize.heightCm > shortSize.heightCm * 1.8);
});

test('text data sanitization rejects unsafe fonts and clamps editable effects', () => {
  const sanitized = sanitizeTextData({
    value: 'x'.repeat(2_500),
    presetId: 'not-a-preset',
    printable: false,
    style: {
      fontId: 'url(javascript:bad)',
      fontSizePt: 50_000,
      fontWeight: 647,
      italic: true,
      underline: true,
      align: 'right',
      lineHeight: 99,
      letterSpacingEm: -99,
      uppercase: true,
      color: 'red',
      opacity: -3,
      strokeWidthPt: 100,
      shadowBlurPt: 100,
    },
  });
  assert.ok(sanitized);
  assert.equal(sanitized.value.length, 2_000);
  assert.equal(sanitized.style.fontId, 'sans');
  assert.equal(sanitized.style.fontSizePt, 300);
  assert.equal(sanitized.style.fontWeight, 600);
  assert.equal(sanitized.style.lineHeight, 3);
  assert.equal(sanitized.style.letterSpacingEm, -.15);
  assert.equal(sanitized.style.color, '#171923');
  assert.equal(sanitized.style.opacity, .05);
  assert.equal(sanitized.style.strokeWidthPt, 20);
  assert.equal(sanitized.style.shadowBlurPt, 50);
  assert.equal(sanitized.printable, false);
});

test('photo border presets map deterministically and render inward at exact thickness', () => {
  const edges = borderEdgesForPreset('horizontal');
  assert.deepEqual(edges, { top: true, right: false, bottom: true, left: false });
  assert.equal(borderPresetForEdges(edges), 'horizontal');

  const border = normalizePhotoBorder({ color: '#635bff', thicknessCm: .5, edges: borderEdgesForPreset('all') });
  assert.ok(border);
  assert.deepEqual(photoBorderRects(10, 20, border), [
    { edge: 'top', x: 0, y: 0, width: 10, height: .5 },
    { edge: 'right', x: 9.5, y: 0, width: .5, height: 20 },
    { edge: 'bottom', x: 0, y: 19.5, width: 10, height: .5 },
    { edge: 'left', x: 0, y: 0, width: .5, height: 20 },
  ]);
});

test('invalid or empty photo borders are removed and oversized borders stay inside the photo', () => {
  assert.equal(normalizePhotoBorder({ thicknessCm: 1, edges: {} }), undefined);
  assert.equal(normalizePhotoBorder({ thicknessCm: 0, edges: borderEdgesForPreset('all') }), undefined);
  const border = normalizePhotoBorder({ color: 'bad', thicknessCm: 9, edges: borderEdgesForPreset('left') });
  assert.ok(border);
  assert.equal(border.color, '#ffffff');
  assert.deepEqual(photoBorderRects(4, 3, border), [
    { edge: 'left', x: 0, y: 0, width: 1.5, height: 3 },
  ]);
});
