/* eslint-disable typescript/no-floating-promises */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CUT_SHAPES,
  MIN_CUT_REGION_SIZE,
  createPolygonCutRegion,
  cutPixelBounds,
  cutRegionSvgPath,
  moveCutRegion,
  resizeCutRegion,
  sanitizeCutRegion,
  traceCutRegionPath,
  type CutPathSink,
  type CutPoint,
  type CutRegion,
  type CutResizeHandle,
} from '../lib/sheet-cuts.ts';

function assertClose(actual: number, expected: number, message?: string) {
  assert.ok(
    Math.abs(actual - expected) < 0.000001,
    message ?? `${actual} should equal ${expected}`,
  );
}

function assertBoundsClose(
  actual: CutRegion['bounds'],
  expected: CutRegion['bounds'],
) {
  assertClose(actual.x, expected.x, 'bounds x');
  assertClose(actual.y, expected.y, 'bounds y');
  assertClose(actual.w, expected.w, 'bounds width');
  assertClose(actual.h, expected.h, 'bounds height');
}

function rectangleRegion(
  bounds = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 },
): CutRegion {
  return { id: 'cut-1', shape: 'rectangle', bounds, source: 'manual' };
}

test('adjacent grid cuts share rounded pixel boundaries without dropping source pixels', () => {
  const imageWidth = 1001;
  const imageHeight = 667;
  const rows = 2;
  const columns = 3;
  const cells = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) =>
      cutPixelBounds(
        { x: column / columns, y: row / rows, w: 1 / columns, h: 1 / rows },
        imageWidth,
        imageHeight,
      ),
    ),
  );

  cells.forEach((row) => {
    assert.equal(row[0].x, 0);
    assert.equal(row[row.length - 1].x + row[row.length - 1].width, imageWidth);
    assert.equal(
      row.reduce((sum, bounds) => sum + bounds.width, 0),
      imageWidth,
    );
    row.slice(1).forEach((bounds, index) => {
      assert.equal(row[index].x + row[index].width, bounds.x);
    });
  });
  for (let column = 0; column < columns; column += 1) {
    assert.equal(cells[0][column].y, 0);
    assert.equal(
      cells[0][column].y + cells[0][column].height,
      cells[1][column].y,
    );
    assert.equal(cells[1][column].y + cells[1][column].height, imageHeight);
    assert.equal(
      cells[0][column].height + cells[1][column].height,
      imageHeight,
    );
  }
});

test('region sanitization accepts every shape, normalizes bounds, and rejects unsafe geometry', () => {
  CUT_SHAPES.forEach((shape) => {
    const region = sanitizeCutRegion({
      id: ` ${shape}-1 `,
      shape,
      bounds: { x: 0.9, y: 0.8, w: -0.4, h: -0.6 },
      points:
        shape === 'polygon'
          ? [
              { x: 0, y: 0 },
              { x: 1, y: 0 },
              { x: 0.5, y: 1 },
            ]
          : undefined,
      source: ' manual\u0000 ',
    });
    assert.ok(region);
    assert.equal(region.id, `${shape}-1`);
    assert.equal(region.shape, shape);
    assert.equal(region.source, 'manual');
    assertClose(region.bounds.x, 0.5);
    assertClose(region.bounds.y, 0.2);
    assertClose(region.bounds.w, 0.4);
    assertClose(region.bounds.h, 0.6);
    assert.equal(Boolean(region.points), shape === 'polygon');
  });

  assert.equal(
    sanitizeCutRegion({
      id: '',
      shape: 'rectangle',
      bounds: { x: 0, y: 0, w: 1, h: 1 },
    }),
    null,
  );
  assert.equal(
    sanitizeCutRegion({
      id: 'cut',
      shape: 'star',
      bounds: { x: 0, y: 0, w: 1, h: 1 },
    }),
    null,
  );
  assert.equal(
    sanitizeCutRegion({
      id: 'cut',
      shape: 'rectangle',
      bounds: { x: 0, y: 0, w: 0, h: 1 },
    }),
    null,
  );
  assert.equal(
    sanitizeCutRegion({
      id: 'cut',
      shape: 'polygon',
      bounds: { x: 0, y: 0, w: 1, h: 1 },
      points: [
        { x: 0, y: 0 },
        { x: 0.5, y: 0.5 },
        { x: 1, y: 1 },
      ],
    }),
    null,
  );
});

test('image points become a tight polygon region with bounds-relative vertices and stable metadata', () => {
  const points: CutPoint[] = [
    { x: 0.2, y: 0.3 },
    { x: 0.8, y: 0.3 },
    { x: 0.5, y: 0.9 },
    { x: 0.2, y: 0.3 },
  ];
  const region = createPolygonCutRegion('polygon-7', points, 'freehand');

  assert.ok(region);
  assert.equal(region.id, 'polygon-7');
  assert.equal(region.shape, 'polygon');
  assert.equal(region.source, 'freehand');
  assertClose(region.bounds.x, 0.2);
  assertClose(region.bounds.y, 0.3);
  assertClose(region.bounds.w, 0.6);
  assertClose(region.bounds.h, 0.6);
  assert.equal(region.points?.length, 3);
  [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0.5, y: 1 },
  ].forEach((point, index) => {
    assertClose(region.points![index].x, point.x);
    assertClose(region.points![index].y, point.y);
  });
  assert.equal(createPolygonCutRegion('too-short', points.slice(0, 2)), null);
  assert.equal(
    createPolygonCutRegion('collinear', [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.5 },
      { x: 1, y: 1 },
    ]),
    null,
  );
});

test('moving a region preserves shape data and clamps its full bounds to the image', () => {
  const region: CutRegion = {
    id: 'polygon-move',
    shape: 'polygon',
    bounds: { x: 0.25, y: 0.35, w: 0.3, h: 0.2 },
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0.5, y: 1 },
    ],
    source: 'freehand',
  };
  const moved = moveCutRegion(region, 0.9, -0.9);

  assertBoundsClose(moved.bounds, { x: 0.7, y: 0, w: 0.3, h: 0.2 });
  assert.equal(moved.id, region.id);
  assert.equal(moved.shape, region.shape);
  assert.equal(moved.source, region.source);
  assert.deepEqual(moved.points, region.points);
  assert.notEqual(moved.points, region.points);
  assert.deepEqual(region.bounds, { x: 0.25, y: 0.35, w: 0.3, h: 0.2 });
});

test('all eight resize handles keep the opposite edges fixed', () => {
  const expected: Record<CutResizeHandle, CutRegion['bounds']> = {
    n: { x: 0.2, y: 0.3, w: 0.4, h: 0.3 },
    ne: { x: 0.2, y: 0.3, w: 0.5, h: 0.3 },
    e: { x: 0.2, y: 0.2, w: 0.5, h: 0.4 },
    se: { x: 0.2, y: 0.2, w: 0.5, h: 0.5 },
    s: { x: 0.2, y: 0.2, w: 0.4, h: 0.5 },
    sw: { x: 0.3, y: 0.2, w: 0.3, h: 0.5 },
    w: { x: 0.3, y: 0.2, w: 0.3, h: 0.4 },
    nw: { x: 0.3, y: 0.3, w: 0.3, h: 0.3 },
  };

  (Object.keys(expected) as CutResizeHandle[]).forEach((handle) => {
    const result = resizeCutRegion(rectangleRegion(), handle, 0.1, 0.1);
    const target = expected[handle];
    assertClose(result.bounds.x, target.x, `${handle} x`);
    assertClose(result.bounds.y, target.y, `${handle} y`);
    assertClose(result.bounds.w, target.w, `${handle} width`);
    assertClose(result.bounds.h, target.h, `${handle} height`);
  });
});

test('resizing is constrained to the image and enforces a positive minimum size', () => {
  const northWest = resizeCutRegion(rectangleRegion(), 'nw', -1, -1);
  assertBoundsClose(northWest.bounds, { x: 0, y: 0, w: 0.6, h: 0.6 });

  const southEast = resizeCutRegion(rectangleRegion(), 'se', 1, 1);
  assertBoundsClose(southEast.bounds, { x: 0.2, y: 0.2, w: 0.8, h: 0.8 });

  const collapsed = resizeCutRegion(rectangleRegion(), 'nw', 1, 1);
  assertClose(collapsed.bounds.w, MIN_CUT_REGION_SIZE);
  assertClose(collapsed.bounds.h, MIN_CUT_REGION_SIZE);
  assertClose(collapsed.bounds.x + collapsed.bounds.w, 0.6);
  assertClose(collapsed.bounds.y + collapsed.bounds.h, 0.6);

  const constrainedMinimum = resizeCutRegion(
    rectangleRegion({ x: 0.01, y: 0.01, w: 0.08, h: 0.08 }),
    'nw',
    1,
    1,
    1,
  );
  assertBoundsClose(constrainedMinimum.bounds, {
    x: 0,
    y: 0,
    w: 0.09,
    h: 0.09,
  });
});

test('every shape produces a closed, bounds-local mask path', () => {
  const polygonPoints = [
    { x: 0, y: 0 },
    { x: 1, y: 0.25 },
    { x: 0.5, y: 1 },
  ];
  CUT_SHAPES.forEach((shape) => {
    const region: Pick<CutRegion, 'shape' | 'points'> = {
      shape,
      ...(shape === 'polygon' ? { points: polygonPoints } : {}),
    };
    const path = cutRegionSvgPath(region, 200, 100);
    assert.match(path, /^M /);
    assert.match(path, / Z$/);
  });

  const commands: string[] = [];
  const sink: CutPathSink = {
    moveTo: () => commands.push('move'),
    lineTo: () => commands.push('line'),
    bezierCurveTo: () => commands.push('curve'),
    ellipse: () => commands.push('ellipse'),
    closePath: () => commands.push('close'),
  };
  traceCutRegionPath(sink, { shape: 'heart' }, 200, 100);
  assert.deepEqual(commands, [
    'move',
    'curve',
    'curve',
    'curve',
    'curve',
    'close',
  ]);

  commands.length = 0;
  traceCutRegionPath(sink, { shape: 'ellipse' }, 200, 100);
  assert.deepEqual(commands, ['ellipse', 'close']);

  commands.length = 0;
  traceCutRegionPath(
    sink,
    { shape: 'polygon', points: polygonPoints },
    200,
    100,
  );
  assert.deepEqual(commands, ['move', 'line', 'line', 'close']);
});
