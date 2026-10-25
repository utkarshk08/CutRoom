import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { mkdir, readFile } from 'node:fs/promises';
import { validateProjectDocument } from '../lib/project-document.ts';
import { createTextData, TRANSPARENT_PIXEL } from '../lib/text-elements.ts';
import { DEMO_PIECES } from '../lib/studio.ts';

// Isolated profiles only. No real AI requests and no user's browser storage.
const { chromium } = await import(process.env.CUTROOM_PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.launch({ executablePath: process.env.CUTROOM_CHROME_PATH || undefined, headless: true });
const out = 'output/playwright';
await mkdir(out, { recursive: true });
const errors = [];
const context = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
await page.route('**/api/ai-*', route => route.abort());
await page.route('**/__launch-seed', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Test setup</title>' }));
const photo = (id, code, x, y, widthCm = 3, heightCm = 4) => ({ ...DEMO_PIECES[0], id, code, name: code, widthCm, heightCm, x, y, w: widthCm / 40 * 100, h: heightCm / 30 * 100, rotation: 0, locked: false, placed: true });
const fixture = validateProjectDocument({ schemaVersion: 7, name: 'Launch transfer check',
  pieces: [photo('sample', 'P001', 10, 10), photo('color-a', 'P002', 30, 10), photo('color-b', 'P003', 50, 10, 2, 3),
    { ...photo('text', 'T001', 10.5, 12, 2, .5), kind: 'text', text: createTextData('bold-headline', 'TOGETHER'), src: TRANSPARENT_PIXEL }],
  printGroups: [{ id: 'group-a', code: 'G001', memberIds: ['sample', 'text'] }],
  wall: { widthCm: 40, heightCm: 30, color: '#f0edff', photo: DEMO_PIECES[0].src, photoOpacity: .35, furnitureClearanceCm: 0 },
  printPaper: 'A6', printMargin: .5, printGap: 0, cropMarks: true, autoRotatePrint: true,
  printRotationOverrides: { 'color-b': -90 }, printExportFormat: 'png', printDpi: 150,
}).project;

async function saved(page) {
  await page.locator('.saved-indicator.saved').waitFor({ timeout: 15000 });
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('cutroom-studio', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => { const db = open.result; const get = db.transaction('projects').objectStore('projects').get('current'); get.onsuccess = () => { db.close(); resolve(get.result); }; get.onerror = () => reject(get.error); };
  }));
}
async function download(page, button, name) {
  const pending = page.waitForEvent('download');
  await button.click();
  const result = await pending; await result.saveAs(`${out}/${name}`);
  await page.locator('.busy-overlay').waitFor({ state: 'hidden' });
  return `${out}/${name}`;
}
async function printDownload(format, name) {
  await page.getByRole('button', { name: 'Download print pack', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('.print-format-grid button').filter({ hasText: format.toUpperCase() }).click();
  return download(page, dialog.getByRole('button', { name: `Download ${format.toUpperCase()}`, exact: true }), name);
}
try {
  await page.goto('http://localhost:3000/__launch-seed');
  await page.evaluate(async document => {
    for (const [index, piece] of document.pieces.entries()) {
      if (!piece.id.startsWith('color')) continue;
      const canvas = window.document.createElement('canvas'); canvas.width = 150; canvas.height = 200;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = index === 1 ? '#df7d60' : '#58b9aa'; ctx.fillRect(0, 0, 150, 200);
      ctx.fillStyle = '#252238'; ctx.font = 'bold 24px sans-serif'; ctx.fillText(piece.code, 15, 100);
      piece.src = canvas.toDataURL('image/png');
    }
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('cutroom-studio', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('projects');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => { const db = open.result; const tx = db.transaction('projects', 'readwrite'); tx.objectStore('projects').put(document, 'current'); tx.oncomplete = () => { db.close(); resolve(); }; };
    });
  }, fixture);
  await page.goto('http://localhost:3000/');
  await page.locator('.hydration-overlay').waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('button', { name: 'Share app', exact: true }).count(), 1);
  const original = await saved(page);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const backupPath = await download(page, page.getByRole('button', { name: /Download project backup/ }), 'portable-project.json');
  const backup = JSON.parse(await readFile(backupPath, 'utf8'));
  assert.ok(backup.pieces.every(piece => piece.src.startsWith('data:image/')));
  assert.ok(backup.wall.photo.startsWith('data:image/'));
  assert.deepEqual(backup.printGroups, original.printGroups);
  assert.deepEqual(backup.identity, original.identity);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Print pack', exact: true }).click();
  await page.locator('.print-sheet .print-cell').first().waitFor();
  await page.screenshot({ path: `${out}/zero-gap-preview.png` });
  const rects = await page.locator('.print-cell.mixed').evaluateAll(cells => cells.map(cell => ({ x: parseFloat(cell.style.left) / 100, y: parseFloat(cell.style.top) / 100, w: parseFloat(cell.style.width) / 100, h: parseFloat(cell.style.height) / 100 })));
  const markedPath = await printDownload('png', 'zero-gap-marks.png');
  await printDownload('pdf', 'zero-gap-marks.pdf');
  await page.locator('.print-control.toggle-row').filter({ hasText: 'CROP MARKS' }).getByRole('switch').click();
  const plainPath = await printDownload('png', 'zero-gap-plain.png');
  const urls = await Promise.all([markedPath, plainPath].map(async path => 'data:image/png;base64,' + (await readFile(path)).toString('base64')));
  const differences = await page.evaluate(async ({ urls, rects }) => {
    const canvases = await Promise.all(urls.map(url => new Promise(resolve => { const image = new Image(); image.onload = () => { const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; canvas.getContext('2d').drawImage(image, 0, 0); resolve(canvas); }; image.src = url; })));
    const [a, b] = canvases; const da = a.getContext('2d').getImageData(0, 0, a.width, a.height).data; const db = b.getContext('2d').getImageData(0, 0, b.width, b.height).data;
    let withinPhoto = 0, total = 0;
    for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) { const i = (y * a.width + x) * 4;
      if ([0, 1, 2, 3].some(c => da[i + c] !== db[i + c])) { total++; if (rects.some(r => x > r.x * a.width + 1 && x < (r.x + r.w) * a.width - 1 && y > r.y * a.height + 1 && y < (r.y + r.h) * a.height - 1)) withinPhoto++; }
    }
    return { withinPhoto, total, width: a.width, height: a.height };
  }, { urls, rects });
  assert.equal(differences.withinPhoto, 0); assert.ok(differences.total > 0);

  const otherContext = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
  const other = await otherContext.newPage(); other.on('pageerror', error => errors.push(error.message));
  await other.route('**/api/ai-*', route => route.abort());
  await other.goto(process.env.CUTROOM_TRANSFER_ORIGIN || 'http://[::1]:3000/');
  await other.locator('.hydration-overlay').waitFor({ state: 'hidden' });
  // Restored assets must work even if the new site has no bundled demo files.
  await other.route('**/demo/**', route => route.abort());
  await other.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(backupPath);
  await other.getByRole('button', { name: 'Replace project', exact: true }).click();
  await other.locator('.busy-overlay').waitFor({ state: 'hidden' });
  const restored = await saved(other);
  for (const key of ['pieces', 'printGroups', 'identity', 'wall', 'printRotationOverrides', 'printGap', 'printMargin']) assert.ok(isDeepStrictEqual(JSON.parse(JSON.stringify(restored[key])), backup[key]), `Restored ${key} must match the portable JSON`);
  await other.reload(); await other.locator('.hydration-overlay').waitFor({ state: 'hidden' });
  assert.equal(await other.locator('.wall-piece').count(), backup.pieces.length);
  await other.screenshot({ path: `${out}/restored-project.png` });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ backup: 'embedded and restored on another origin, including reload', print: 'PDF + PNG downloaded; marks changed only blank paper', differences, runtimeErrors: errors }, null, 2));
} finally { await browser.close(); }
