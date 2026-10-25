import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createIdentityRegistry, PROJECT_SCHEMA_VERSION } from '../lib/project-document.ts';
import { createTextData, TRANSPARENT_PIXEL } from '../lib/text-elements.ts';
import { piecesOverlap } from '../lib/studio.ts';

// Uses an isolated browser profile and synthetic photos. AI responses are
// controlled here: this checks editor integration, not model layout quality.
const { chromium } = await import(process.env.CUTROOM_PLAYWRIGHT_PATH || 'playwright');
await mkdir('work', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CUTROOM_CHROME_PATH || undefined, headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let responseMode = 'success';
let pendingResponse;
let lastRequest;
await page.route('**/api/ai-layout', async route => {
  lastRequest = route.request().postDataJSON();
  const decision = {
    version: 1, name: 'Test ladder', rationale: 'Measured rigid items arranged on a rising diagonal.',
    placements: lastRequest.units.filter(unit => unit.movable).map((unit, index) => ({ id: unit.id, x: 2500 + index * 2400, y: 7000 - index * 2300 })),
  };
  if (responseMode === 'hold') pendingResponse = () => route.fulfill({ json: decision });
  else await route.fulfill({ json: decision });
});
await page.route('**/__arrangement-test-seed', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Isolated test setup</title>' }));

const wall = { widthCm: 200, heightCm: 140, color: '#f4f0ff', photoOpacity: .8, furnitureClearanceCm: 0 };
function piece(id, code, widthCm, heightCm, x, y, extra = {}) {
  return { id, code, name: `Test ${code}`, src: TRANSPARENT_PIXEL, widthCm, heightCm,
    x, y, w: widthCm / wall.widthCm * 100, h: heightCm / wall.heightCm * 100,
    rotation: 0, placed: true, locked: false, category: 'Test', tone: 'neutral', color: '#7262ff', ...extra };
}
const pieces = [
  piece('photo-a', 'P001', 20, 30, 10, 10),
  piece('text-a', 'T001', 18, 4, 10.5, 14, { kind: 'text', text: createTextData('bold-headline', 'TOGETHER'), zIndex: 4 }),
  piece('photo-b', 'P002', 25, 35, 40, 15, { rotation: 90 }),
  piece('photo-c', 'P003', 35, 20, 65, 40),
  piece('locked', 'P004', 18, 26, 2, 70, { locked: true }),
  piece('text-solo', 'T002', 14, 4, 80, 85, { kind: 'text', text: createTextData('bold-headline', 'FIXED') }),
  piece('loose', 'P005', 20, 20, 5, 5, { placed: false }),
];
function fixture(items = pieces, groups = [{ id: 'group-a', code: 'G001', memberIds: ['photo-a', 'text-a'] }], fixtureWall = wall) {
  return { schemaVersion: PROJECT_SCHEMA_VERSION, name: 'Arrangement browser check', pieces: items, printGroups: groups,
    wall: fixtureWall, measurementUnit: 'cm', showWallLabels: true, autoRotatePrint: true,
    printOverrides: {}, printRotationOverrides: {}, printPaper: 'A3', customSheetW: 32, customSheetH: 45,
    printLandscape: false, printGap: .6, printMargin: 1, cropMarks: true, printExportFormat: 'pdf', printDpi: 300,
    posterPreset: 'A4', sheetPaper: 'A3', identity: createIdentityRegistry(items), updatedAt: new Date().toISOString() };
}
async function loadFixture(project) {
  await page.goto('http://localhost:3000/__arrangement-test-seed');
  await page.evaluate(async document => {
    const colors = ['#9c88ff', '#fc7db2', '#60ccb0', '#fac972'];
    document.pieces.forEach((piece, index) => {
      if (piece.kind === 'text') return;
      const canvas = window.document.createElement('canvas'); canvas.width = 150; canvas.height = 200;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = colors[index % colors.length]; ctx.fillRect(0, 0, 150, 200);
      ctx.fillStyle = '#1d1637'; ctx.font = 'bold 22px sans-serif'; ctx.fillText(piece.code, 20, 105);
      piece.src = canvas.toDataURL('image/png');
    });
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('cutroom-studio', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('projects');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const tx = database.transaction('projects', 'readwrite');
        tx.objectStore('projects').put(document, 'current');
        tx.oncomplete = () => { database.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, project);
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.locator('.hydration-overlay').waitFor({ state: 'hidden', timeout: 60000 });
  await page.locator('.side-tabs').getByRole('button', { name: 'Assistant', exact: true }).click();
  await page.locator('.choice-grid.six').waitFor();
}
async function snapshot() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await page.locator('.saved-indicator.saved').waitFor();
    const result = await page.evaluate(async () => {
      const project = await new Promise((resolve, reject) => {
        const open = indexedDB.open('cutroom-studio', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const request = database.transaction('projects').objectStore('projects').get('current');
          request.onsuccess = () => { database.close(); resolve(request.result); };
        };
      });
      const current = [...document.querySelectorAll('.wall-piece')].every(element => {
        const saved = project.pieces.find(piece => piece.id === element.dataset.pieceId);
        return saved && Math.abs(saved.x - parseFloat(element.style.left)) < .001 && Math.abs(saved.y - parseFloat(element.style.top)) < .001;
      });
      const toggle = document.querySelector('[aria-label="Show photo ID labels on the wall"]');
      const labels = toggle?.getAttribute('aria-checked') === 'true' || toggle?.checked === true;
      return { project, current: current && labels === project.showWallLabels };
    });
    if (result.current) return result.project;
    await page.waitForTimeout(100);
  }
  throw new Error('The saved project did not match the displayed wall.');
}
const positions = project => project.pieces.map(({ id, x, y }) => ({ id, x, y }));
function assertRigid(before, after) {
  assert.deepEqual(after.printGroups, before.printGroups, 'groups must survive arranging');
  for (const original of before.pieces) {
    const current = after.pieces.find(piece => piece.id === original.id);
    const { x: beforeX, y: beforeY, ...beforeRest } = original;
    const { x: afterX, y: afterY, ...afterRest } = current;
    assert.deepEqual(afterRest, beforeRest, `${original.code}: only position may change`);
    if (!original.placed || original.locked || original.id === 'text-solo') {
      assert.deepEqual([afterX, afterY], [beforeX, beforeY], `${original.code}: loose/locked/standalone text stays fixed`);
    }
  }
  const byId = project => Object.fromEntries(project.pieces.map(piece => [piece.id, piece]));
  const a = byId(before); const b = byId(after);
  for (const axis of ['x', 'y']) assert.ok(Math.abs((b['text-a'][axis] - b['photo-a'][axis]) - (a['text-a'][axis] - a['photo-a'][axis])) < 1e-9, 'group text must retain its exact offset');
}
const undo = () => page.getByRole('button', { name: 'Undo', exact: true }).click();
const redo = () => page.getByRole('button', { name: 'Redo', exact: true }).click();
const template = name => page.locator('.choice-grid.six').getByRole('button', { name: new RegExp(`^${name}`) }).click();
const activeTemplate = () => page.locator('.choice-grid.six .active').allTextContents();
async function startHeldAi() {
  responseMode = 'hold'; pendingResponse = undefined;
  await page.getByRole('textbox', { name: 'Layout brief' }).fill('Arrange these items into a measured size ladder.');
  await page.locator('.generate-button').click();
  for (let attempt = 0; !pendingResponse && attempt < 100; attempt += 1) await page.waitForTimeout(20);
  assert.ok(pendingResponse, 'AI request reached the controlled endpoint');
}
try {
  await loadFixture(fixture());
  const original = await snapshot();
  const originalTemplate = await activeTemplate();
  assert.equal(await page.locator('.wall-piece').count(), 6);
  await template('Salon');
  const salon = await snapshot();
  assert.notDeepEqual(positions(salon), positions(original));
  assertRigid(original, salon);
  await undo();
  assert.deepEqual(positions(await snapshot()), positions(original));
  assert.deepEqual(await activeTemplate(), originalTemplate, 'Undo restores the active composition too');
  await redo();
  assert.deepEqual(positions(await snapshot()), positions(salon));
  assert.match((await activeTemplate())[0], /Salon/);
  console.log('PASS composition preserves sizes, rotations, groups, loose/locked pieces; one-step Undo/Redo restores geometry and template');

  await page.getByRole('textbox', { name: 'Layout brief' }).fill('Arrange these items into a measured size ladder.');
  await page.locator('.generate-button').click();
  await page.locator('.generate-button[aria-busy="false"]').waitFor();
  const ai = await snapshot();
  assertRigid(salon, ai);
  assert.notDeepEqual(positions(ai), positions(salon));
  assert.equal(lastRequest.units.length, 5, 'AI sees four rigid photo/group units plus fixed text, not the loose piece');
  assert.equal(lastRequest.units.find(unit => unit.kind === 'group')?.memberCount, 2);
  assert.equal(lastRequest.units.filter(unit => unit.movable).length, 3);
  assert.equal(lastRequest.units.some(unit => unit.memberCodes.includes('P005')), false);
  assert.equal(await page.getByText('AI CUSTOM ACTIVE', { exact: true }).count(), 1);
  await undo();
  assert.deepEqual(positions(await snapshot()), positions(salon));
  assert.match((await activeTemplate())[0], /Salon/);
  await redo();
  assert.deepEqual(positions(await snapshot()), positions(ai));
  assert.equal(await page.getByText('AI CUSTOM ACTIVE', { exact: true }).count(), 1);
  await page.screenshot({ path: 'work/arrangement-checkpoint.png' });
  console.log('PASS custom AI keeps group as one unit and excludes loose pieces; Undo/Redo restores the custom composition');

  await startHeldAi();
  await template('Diamond');
  const newerTemplate = await snapshot();
  await pendingResponse();
  await page.locator('.generate-button[aria-busy="false"]').waitFor();
  assert.deepEqual(positions(await snapshot()), positions(newerTemplate));
  assert.match(await page.locator('.ai-note').textContent(), /newer edit untouched/);
  await undo();
  assert.deepEqual(positions(await snapshot()), positions(ai), 'stale response adds no extra history step');
  console.log('PASS AI result cannot overwrite a newer composition or add an Undo entry');

  await startHeldAi();
  const labelSwitch = page.getByRole('switch', { name: 'Show photo ID labels on the wall' });
  await labelSwitch.click();
  assert.equal((await snapshot()).showWallLabels, false);
  await pendingResponse();
  await page.locator('.generate-button[aria-busy="false"]').waitFor();
  assert.match(await page.locator('.ai-note').textContent(), /newer edit untouched/);
  assert.deepEqual(positions(await snapshot()), positions(ai));
  await undo();
  assert.equal((await snapshot()).showWallLabels, true);
  assert.deepEqual(positions(await snapshot()), positions(ai));
  console.log('PASS pending AI also respects non-geometry edits; their Undo state remains intact');

  await loadFixture(fixture(pieces.map(piece => ({ ...piece, locked: piece.placed }))));
  const locked = await snapshot();
  await labelSwitch.click();
  await snapshot();
  await undo();
  await snapshot();
  assert.equal(await page.getByRole('button', { name: 'Redo', exact: true }).isEnabled(), true);
  await template('Diamond');
  assert.deepEqual(positions(await snapshot()), positions(locked));
  assert.equal(await page.getByRole('button', { name: 'Undo', exact: true }).isEnabled(), false);
  assert.equal(await page.getByRole('button', { name: 'Redo', exact: true }).isEnabled(), true, 'no-op templates must not clear Redo');
  console.log('PASS all-locked/no-op composition leaves history and Redo untouched');

  const crowdedWall = { ...wall, widthCm: 100, heightCm: 100 };
  const crowded = [piece('big-a', 'P001', 49, 90, 0, 0, { w: 49, h: 90 }), piece('big-b', 'P002', 49, 90, 51, 0, { w: 49, h: 90 })];
  await loadFixture(fixture(crowded, [], crowdedWall));
  await template('Salon');
  const fitted = await snapshot();
  assert.equal(piecesOverlap(fitted.pieces[0], fitted.pieces[1], crowdedWall), false, 'a feasible crowded wall must not acquire an overlap');
  assert.deepEqual(fitted.pieces.map(piece => [piece.widthCm, piece.heightCm]), [[49, 90], [49, 90]]);
  console.log('PASS large-photo collision regression in the live editor');
  assert.deepEqual(errors, []);
  console.log('Browser errors:', errors);
} catch (error) {
  await page.screenshot({ path: 'work/arrangement-failure.png' });
  throw error;
} finally {
  await context.close();
  await browser.close();
}
