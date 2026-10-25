import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

// Run from the project root with the local preview already running. Use an
// existing Playwright installation; do not add it to production dependencies.
const { chromium } = await import(process.env.CUTROOM_PLAYWRIGHT_PATH || 'playwright');
await mkdir('work', { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CUTROOM_CHROME_PATH || undefined, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const proposed = { version: 1, regions: [
  [0, 0, 3333, 3900], [3333, 0, 3334, 3900], [6667, 0, 3333, 3900],
  [0, 3900, 3600, 2500], [3600, 3900, 6400, 2500],
  [0, 6400, 3333, 3600], [3333, 6400, 3334, 3600], [6667, 6400, 3333, 3600],
].map(([x, y, width, height], i) => ({ box: { x, y, width, height }, shape: 'rectangle', label: `Panel ${i + 1}`, confidence: 95 })) };
let pendingResponse;
let responseMode = 'hold';
await page.route('**/api/ai-cutouts', async route => {
  if (responseMode === 'hold') {
    pendingResponse = () => route.fulfill({ json: proposed });
  } else if (responseMode === 'error') {
    await route.fulfill({ status: 502, json: { message: 'Test detection unavailable. Please retry.' } });
  } else {
    await route.fulfill({ json: proposed });
  }
});
async function openSheet(name = 'test-sheet.png') {
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 601; canvas.height = 853;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ff659c'; ctx.fillRect(0, 0, 601, 853);
    ctx.fillStyle = '#6157ee'; ctx.fillRect(301, 0, 300, 427);
    ctx.fillStyle = '#15bc9b'; ctx.fillRect(0, 427, 301, 426);
    ctx.fillStyle = '#ffe566'; ctx.fillRect(301, 427, 300, 426);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('input[type=file]').first().setInputFiles({ name, mimeType: 'image/png', buffer: Buffer.from(data, 'base64') });
  await page.getByRole('button', { name: /A sheet with many photos/ }).click();
  await page.locator('.cutter-dialog').waitFor();
}
try {
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.locator('.hydration-overlay').waitFor({ state: 'hidden', timeout: 60000 });
  await openSheet();
  await page.getByRole('button', { name: 'AI detect', exact: true }).click();
  await page.getByRole('button', { name: 'Find editable cuts' }).click();
  await page.waitForFunction(() => document.querySelector('.ai-cut-detect')?.disabled);
  while (!pendingResponse) await new Promise(resolve => setTimeout(resolve, 20));
  await page.getByRole('button', { name: 'Manual', exact: true }).click();
  await pendingResponse();
  await page.waitForTimeout(500);
  console.log('After switching to Manual while AI was pending:', await page.locator('.cut-method-toggle .active').textContent());
  console.log('Preview cards:', await page.locator('.crp-card').count());
  assert.equal((await page.locator('.cut-method-toggle .active').textContent()).trim(), 'Manual');
  const initialCount = await page.locator('.piece-card').count();
  async function checkSourceRatio() {
    const box = await page.locator('.cutout-canvas').boundingBox();
    assert.ok(Math.abs(box.width / box.height - 601 / 853) < 0.002, 'cutting coordinates must match the visible source aspect ratio');
    return box;
  }
  let box = await checkSourceRatio();
  await page.getByRole('button', { name: 'Heart', exact: true }).click();
  await page.mouse.move(box.x + box.width * .1, box.y + box.height * .1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .45, box.y + box.height * .42, { steps: 8 });
  await page.mouse.up();
  assert.equal(await page.getByRole('button', { name: /^Resize Cut 1 from/ }).count(), 8);
  const handle = await page.getByRole('button', { name: 'Resize Cut 1 from right', exact: true }).boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 15, handle.y + handle.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.getByRole('button', { name: /Preview cuts/ }).click();
  assert.equal(await page.locator('.crp-card').count(), 1);
  assert.match(await page.locator('.crp-shape').textContent(), /Heart/);
  await page.getByRole('button', { name: 'Add another', exact: true }).click();
  await page.locator('.cutout-canvas').waitFor();
  await page.getByRole('button', { name: 'Point by point', exact: true }).click();
  box = await checkSourceRatio();
  for (const [x, y] of [[.6,.55],[.9,.55],[.75,.75]]) {
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
    await page.waitForTimeout(50);
  }
  await page.getByRole('button', { name: 'Close and finish custom shape', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: /^Move point/ }).count(), 3);
  await page.getByRole('button', { name: /Preview cuts/ }).click();
  assert.equal(await page.locator('.crp-card').count(), 2);
  assert.equal(await page.locator('.piece-card').count(), initialCount, 'proposals must not create pieces');
  await page.screenshot({ path: 'work/cutout-manual-preview.png' });
  await page.getByRole('button', { name: 'Create 2 cutouts', exact: true }).evaluate(button => { button.click(); button.click(); });
  await page.locator('.cutter-dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.piece-card').count(), initialCount + 2, 'double approval must create pieces only once');
  const alpha = await page.locator('.piece-card img').last().evaluate(async element => {
    const image = new Image(); image.src = element.src; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    return [ctx.getImageData(0, canvas.height - 1, 1, 1).data[3], ctx.getImageData(canvas.width / 2, canvas.height / 3, 1, 1).data[3]];
  });
  assert.deepEqual(alpha, [0, 255], 'polygon output preserves transparency and subject pixels');
  console.log('PASS manual heart/polygon, eight handles, matching preview, explicit single approval, transparent output');

  await openSheet('grid-sheet.png');
  await page.getByRole('spinbutton', { name: 'Cut grid rows' }).fill('2');
  await page.getByRole('spinbutton', { name: 'Cut grid columns' }).fill('3');
  await page.getByRole('button', { name: /Preview cuts/ }).click();
  assert.equal(await page.locator('.crp-card').count(), 6);
  await page.getByRole('button', { name: 'Create 6 cutouts', exact: true }).click();
  await page.locator('.cutter-dialog').waitFor({ state: 'hidden' });
  const gridSizes = await page.locator('.piece-card img').evaluateAll(async elements => Promise.all(elements.slice(-6).map(async element => {
    const image = new Image(); image.src = element.src; await image.decode(); return [image.naturalWidth, image.naturalHeight];
  })));
  assert.equal(gridSizes.reduce((sum, [w,h]) => sum + w*h, 0), 601 * 853, 'grid keeps every source pixel on odd-sized images');
  console.log('PASS grid preview and no lost pixels after approval');

  await openSheet('ai-sheet.png');
  await page.getByRole('button', { name: 'AI detect', exact: true }).click();
  responseMode = 'error';
  await page.getByRole('button', { name: 'Find editable cuts' }).click();
  await page.locator('.ai-cut-status.error').waitFor();
  assert.match(await page.locator('.ai-cut-status.error').textContent(), /Test detection unavailable/);
  responseMode = 'success';
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.locator('.crp-card').first().waitFor();
  assert.equal(await page.locator('.crp-card').count(), 8, 'API response without optional points must reach the gallery');
  assert.equal(await page.locator('.piece-card').count(), initialCount + 8, 'AI preview does not create pieces');
  await page.screenshot({ path: 'work/cutout-ai-preview.png' });
  await page.getByRole('button', { name: 'Edit regions', exact: true }).click();
  await checkSourceRatio();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await checkSourceRatio();
  for (const height of [667, 844]) {
    await page.setViewportSize({ width: 390, height });
    await page.waitForTimeout(150);
    await checkSourceRatio();
    const dialog = await page.locator('.cutter-dialog').boundingBox();
    const cancel = await page.locator('.cutter-footer').getByRole('button', { name: 'Cancel', exact: true }).boundingBox();
    const create = await page.getByRole('button', { name: 'Create 8 cutouts', exact: true }).boundingBox();
    assert.ok(cancel.y + cancel.height <= dialog.y + dialog.height && create.y + create.height <= dialog.y + dialog.height, 'mobile approval buttons must fit inside the dialog');
    assert.ok(Math.abs(cancel.y - create.y) < 2, 'mobile approval and cancel stay side by side');
  }
  await page.getByRole('button', { name: /Preview cuts/ }).click();
  await page.screenshot({ path: 'work/cutout-mobile-preview.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log('PASS AI result gallery, retry, source aspect ratio on desktop/mobile and visible approval controls');

  responseMode = 'hold'; pendingResponse = undefined;
  await page.getByRole('button', { name: 'Find editable cuts' }).click();
  while (!pendingResponse) await new Promise(resolve => setTimeout(resolve, 20));
  const oldResponse = pendingResponse;
  await page.getByRole('button', { name: 'Close cutter' }).click();
  await openSheet('replacement-sheet.png');
  await oldResponse().catch(() => {});
  await page.waitForTimeout(200);
  assert.equal((await page.locator('.cut-method-toggle .active').textContent()).trim(), 'Grid');
  assert.equal(await page.locator('.crp-card').count(), 0, 'old sheet response must not alter the new session');
  console.log('PASS close/change-sheet ignores old AI response');
  await page.getByRole('button', { name: 'AI detect', exact: true }).click();
  await page.clock.install();
  pendingResponse = undefined;
  await page.getByRole('button', { name: 'Find editable cuts' }).click();
  while (!pendingResponse) await new Promise(resolve => setTimeout(resolve, 20));
  await page.clock.fastForward(120_001);
  await page.locator('.ai-cut-status.error').waitFor();
  assert.match(await page.locator('.ai-cut-status.error').textContent(), /took too long/);
  assert.equal(await page.getByRole('button', { name: 'Find editable cuts' }).isEnabled(), true);
  console.log('PASS timeout exposes retry and unlocks controls');
  assert.deepEqual(errors, []);
  console.log('Browser errors:', errors);
} catch (error) {
  await page.screenshot({ path: 'work/cutout-failure.png' });
  throw error;
} finally {
  await context.close();
  await browser.close();
}
