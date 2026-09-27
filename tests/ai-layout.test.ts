/* eslint-disable typescript/no-floating-promises */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AI_COORDINATE_SCALE,
  aiLayoutDecisionSchema,
  localLayoutDecision,
  movableAiUnitIds,
  parseAiLayoutDecision,
  sanitizeAiLayoutRequest,
} from '../lib/ai-layout.ts';

const rawUnits = [
  {
    id: 'u0', code: 'P001', name: 'Small portrait', kind: 'photo', memberCount: 1,
    memberCodes: ['P001'], movable: true, footprintWidthCm: 8, footprintHeightCm: 10,
    footprintAreaCm2: 999_999, x: 2_000, y: 2_500, categories: ['Cinema'], tones: ['warm'],
    src: 'data:image/png;base64,never-send-this',
  },
  {
    id: 'u1', code: 'G001', name: 'Photo and title', kind: 'group', memberCount: 2,
    memberCodes: ['P002', 'T001'], movable: true, footprintWidthCm: 24, footprintHeightCm: 20,
    footprintAreaCm2: 1, x: 5_000, y: 5_000, categories: ['Friends'], tones: ['cool', 'neutral'],
  },
  {
    id: 'u2', code: 'P003', name: 'Locked hero', kind: 'photo', memberCount: 1,
    memberCodes: ['P003'], movable: false, footprintWidthCm: 18, footprintHeightCm: 30,
    footprintAreaCm2: 540, x: 8_000, y: 7_500, categories: ['Hero'], tones: ['dark'],
  },
];

function makeRequest(brief = 'Compare their physical size and make a ladder rising to the right.') {
  return sanitizeAiLayoutRequest({
    version: 1,
    brief,
    wall: { widthCm: 250, heightCm: 100 },
    density: 62,
    groupStrength: 65,
    units: rawUnits,
  });
}

test('AI request sanitization keeps bounded unit metadata and never carries image data', () => {
  const request = makeRequest();
  assert.equal(request.units[0].name, 'Small portrait');
  assert.deepEqual(request.units[1].memberCodes, ['P002', 'T001']);
  assert.equal('src' in request.units[0], false);
  assert.equal(request.units[0].footprintAreaCm2, 80, 'area is derived from trusted dimensions');
  assert.deepEqual(movableAiUnitIds(request), ['u0', 'u1']);
});

test('local ladder fallback orders rigid units by footprint area and keeps locked units out', () => {
  const request = makeRequest();
  const decision = localLayoutDecision(request);
  const small = decision.placements.find(({ id }) => id === 'u0')!;
  const largeGroup = decision.placements.find(({ id }) => id === 'u1')!;
  assert.match(decision.name, /ladder/i);
  assert.ok(small.y < largeGroup.y, 'the smaller unit sits above the larger group');
  assert.ok(small.x < largeGroup.x, 'a right-rising ladder progresses horizontally');
  assert.deepEqual(decision.placements.map(({ id }) => id), ['u0', 'u1']);
});

test('unknown local briefs are an honest no-op, not an unrelated template', () => {
  const request = makeRequest('Surprise me with a composition named after a dream.');
  const decision = localLayoutDecision(request);
  assert.equal(decision.name, 'Keep current arrangement');
  assert.deepEqual(decision.placements, [
    { id: 'u0', x: 2_000, y: 2_500 },
    { id: 'u1', x: 5_000, y: 5_000 },
  ]);
});

test('structured AI response requires exact movable-ID coverage and returns deterministic order', () => {
  const request = makeRequest('Draw an asymmetric heart.');
  const decision = parseAiLayoutDecision({
    version: 1,
    name: 'Off-centre heartbeat',
    rationale: 'The grouped title anchors one lobe while the smaller portrait closes the point.',
    placements: [
      { id: 'u1', x: 6_400, y: 3_100 },
      { id: 'u0', x: 4_700, y: 7_800 },
    ],
  }, request);
  assert.deepEqual(decision.placements.map(({ id }) => id), ['u0', 'u1']);
  assert.equal(decision.placements[0].y, 7_800);
});

test('structured AI response atomically rejects duplicate, missing, fixed, or out-of-range placements', () => {
  const request = makeRequest();
  const base = { version: 1, name: 'Custom', rationale: 'A measured freeform composition.' };
  assert.throws(() => parseAiLayoutDecision({ ...base, placements: [
    { id: 'u0', x: 2_000, y: 2_000 },
    { id: 'u0', x: 4_000, y: 4_000 },
  ] }, request), /invalid|duplicate/i);
  assert.throws(() => parseAiLayoutDecision({ ...base, placements: [
    { id: 'u0', x: 2_000, y: 2_000 },
  ] }, request), /incomplete/i);
  assert.throws(() => parseAiLayoutDecision({ ...base, placements: [
    { id: 'u0', x: 2_000, y: 2_000 },
    { id: 'u2', x: 4_000, y: 4_000 },
  ] }, request), /invalid|duplicate/i);
  assert.throws(() => parseAiLayoutDecision({ ...base, placements: [
    { id: 'u0', x: AI_COORDINATE_SCALE + 1, y: 2_000 },
    { id: 'u1', x: 4_000, y: 4_000 },
  ] }, request), /invalid|duplicate/i);
});

test('dynamic strict schema asks for exactly one placement per movable unit', () => {
  const schema = aiLayoutDecisionSchema(['u0', 'u1']);
  assert.equal(schema.properties.placements.minItems, 2);
  assert.equal(schema.properties.placements.maxItems, 2);
  assert.deepEqual(schema.properties.placements.items.properties.id.enum, ['u0', 'u1']);
});
