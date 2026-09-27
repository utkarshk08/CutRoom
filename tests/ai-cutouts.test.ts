/* eslint-disable typescript/no-floating-promises */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AiCutoutRequestError,
  AI_CUTOUT_COORDINATE_SCALE,
  aiCutoutDecisionSchema,
  mapAiCutoutRegion,
  mapAiCutoutRegionToCutRegion,
  MAX_AI_CUTOUT_ENCODED_CHARS,
  MAX_AI_CUTOUT_POLYGON_POINTS,
  MAX_AI_CUTOUT_REGIONS,
  parseAiCutoutDecision,
  sanitizeAiCutoutRequest,
} from '../lib/ai-cutouts.ts';

// The complete PNG signature is sufficient for request-contract tests; image
// decoding remains the provider's responsibility.
const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';

const rectangle = {
  box: { x: 1_000, y: 2_000, width: 4_000, height: 5_000 },
  shape: 'rectangle',
  label: 'Top-left poster panel',
  confidence: 94,
  points: [],
};

function decisionWith(region: unknown) {
  return { version: 1, regions: [region] };
}

test('AI cutout request sanitization accepts a bounded canonical image and exact preferences', () => {
  const request = sanitizeAiCutoutRequest({
    imageDataUrl: 'DATA:IMAGE/PNG;BASE64,iVBORw0KGgo=',
    brief: '  Find every separate poster panel.  ',
    shapePreference: 'auto',
  });
  assert.equal(request.imageDataUrl, PNG_DATA_URL);
  assert.equal(request.imageMimeType, 'image/png');
  assert.equal(request.imageBytes, 8);
  assert.equal(request.brief, 'Find every separate poster panel.');
  assert.equal(request.shapePreference, 'auto');
});

test('AI cutout request rejects unsupported fields, MIME types, malformed base64, and oversized images', () => {
  assert.throws(
    () =>
      sanitizeAiCutoutRequest({
        imageDataUrl: PNG_DATA_URL,
        brief: 'Find panels.',
        shapePreference: 'rectangle',
        unexpected: true,
      }),
    (error) =>
      error instanceof AiCutoutRequestError && error.code === 'invalid_request',
  );

  assert.throws(
    () =>
      sanitizeAiCutoutRequest({
        imageDataUrl: 'data:image/gif;base64,R0lGODlh',
        brief: 'Find panels.',
        shapePreference: 'auto',
      }),
    (error) =>
      error instanceof AiCutoutRequestError &&
      error.code === 'unsupported_image_type',
  );

  assert.throws(
    () =>
      sanitizeAiCutoutRequest({
        imageDataUrl: 'data:image/png;base64,iVBORw0KGgo*',
        brief: 'Find panels.',
        shapePreference: 'auto',
      }),
    (error) =>
      error instanceof AiCutoutRequestError &&
      error.code === 'invalid_image_data',
  );

  const oversized = `data:image/png;base64,${'A'.repeat(MAX_AI_CUTOUT_ENCODED_CHARS + 68)}`;
  assert.throws(
    () =>
      sanitizeAiCutoutRequest({
        imageDataUrl: oversized,
        brief: 'Find panels.',
        shapePreference: 'auto',
      }),
    (error) =>
      error instanceof AiCutoutRequestError &&
      error.code === 'image_too_large' &&
      error.status === 413,
  );
});

test('AI cutout response accepts exact in-bounds boxes and strips empty non-polygon points', () => {
  const decision = parseAiCutoutDecision(decisionWith(rectangle));
  assert.deepEqual(decision, {
    version: 1,
    regions: [
      {
        box: rectangle.box,
        shape: 'rectangle',
        label: rectangle.label,
        confidence: 94,
      },
    ],
  });
  assert.equal(
    aiCutoutDecisionSchema.properties.regions.maxItems,
    MAX_AI_CUTOUT_REGIONS,
  );
  assert.equal(aiCutoutDecisionSchema.additionalProperties, false);
  assert.deepEqual(parseAiCutoutDecision(decision), decision);
});

test('AI cutout response removes repeated proposals for the same exact source box', () => {
  const decision = parseAiCutoutDecision({
    version: 1,
    regions: [
      rectangle,
      { ...rectangle, label: 'Repeated panel', confidence: 80 },
    ],
  });
  assert.equal(decision.regions.length, 1);
  assert.equal(decision.regions[0].label, rectangle.label);
});

test('AI cutout response rejects box overflow, excessive regions, and arbitrary nested fields', () => {
  assert.throws(
    () =>
      parseAiCutoutDecision(
        decisionWith({
          ...rectangle,
          box: { x: 9_000, y: 2_000, width: 1_001, height: 5_000 },
        }),
      ),
    /outside/i,
  );

  assert.throws(
    () =>
      parseAiCutoutDecision({
        version: 1,
        regions: Array.from(
          { length: MAX_AI_CUTOUT_REGIONS + 1 },
          () => rectangle,
        ),
      }),
    /between/i,
  );

  assert.throws(
    () =>
      parseAiCutoutDecision(
        decisionWith({
          ...rectangle,
          box: { ...rectangle.box, rotation: 10 },
        }),
      ),
    /outside/i,
  );

  assert.throws(
    () =>
      parseAiCutoutDecision({
        version: 1,
        regions: [rectangle],
        arbitrary: 'field',
      }),
    /between/i,
  );
});

test('polygon proposals require bounded, distinct, non-collinear relative points', () => {
  const polygon = {
    ...rectangle,
    shape: 'polygon',
    points: [
      { x: 0, y: 0 },
      { x: AI_CUTOUT_COORDINATE_SCALE, y: 0 },
      { x: 2_500, y: 5_000 },
    ],
  };
  const parsed = parseAiCutoutDecision(decisionWith(polygon));
  assert.deepEqual(parsed.regions[0].points, polygon.points);

  assert.throws(
    () =>
      parseAiCutoutDecision(
        decisionWith({
          ...polygon,
          points: polygon.points.slice(0, 2),
        }),
      ),
    /3 to/i,
  );

  assert.throws(
    () =>
      parseAiCutoutDecision(
        decisionWith({
          ...polygon,
          points: Array.from(
            { length: MAX_AI_CUTOUT_POLYGON_POINTS + 1 },
            (_, index) => ({
              x: index,
              y: index % 2,
            }),
          ),
        }),
      ),
    /3 to/i,
  );

  assert.throws(
    () =>
      parseAiCutoutDecision(
        decisionWith({
          ...polygon,
          points: [
            { x: 0, y: 0 },
            { x: 5_000, y: 5_000 },
            { x: 10_000, y: 10_000 },
          ],
        }),
      ),
    /non-collinear/i,
  );

  assert.throws(
    () =>
      parseAiCutoutDecision(
        decisionWith({
          ...rectangle,
          points: polygon.points,
        }),
      ),
    /only polygon/i,
  );
});

test('mapping converts boxes and relative polygon points into editor source coordinates', () => {
  const polygonRegion = parseAiCutoutDecision(
    decisionWith({
      ...rectangle,
      shape: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 10_000, y: 0 },
        { x: 2_500, y: 5_000 },
      ],
    }),
  ).regions[0];
  assert.deepEqual(mapAiCutoutRegion(polygonRegion), {
    rect: { x: 0.1, y: 0.2, w: 0.4, h: 0.5 },
    polygon: [
      { x: 0.1, y: 0.2 },
      { x: 0.5, y: 0.2 },
      { x: 0.2, y: 0.45 },
    ],
  });
  assert.deepEqual(mapAiCutoutRegionToCutRegion(polygonRegion, 'ai-region-1'), {
    id: 'ai-region-1',
    shape: 'polygon',
    bounds: { x: 0.1, y: 0.2, w: 0.4, h: 0.5 },
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0.25, y: 0.5 },
    ],
    source: 'ai-vision',
  });
});
