// Run with playwright-cli run-code --filename in a dedicated localhost profile.
// No real AI requests. Never point this check at the user's normal browser profile.
async (page) => {
  if (new URL(page.url()).hostname !== 'localhost') throw new Error('Use an isolated localhost test session.');
  await page.route('**/api/ai-*', route => route.abort());
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const results = { viewports: [], keyboard: {}, namedControls: {} };
  const assertVisibleInsideViewport = async (locator, label) => {
    const box = await locator.boundingBox();
    const size = page.viewportSize();
    check(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= size.width + 1 && box.y + box.height <= size.height + 1, `${label} must fit inside the viewport`);
  };
  await page.locator('.hydration-overlay').waitFor({ state: 'hidden' });
  // Start with the full editor visible even if the prior run ended on a mobile panel.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.locator('.wall-dialog');
  await dialog.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))));
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.waitForFunction(({ width, height }) => {
      const box = document.querySelector('.wall-dialog')?.getBoundingClientRect();
      return innerWidth === width && innerHeight === height && box && box.x >= -1 && box.y >= -1 && box.right <= width + 1 && box.bottom <= height + 1;
    }, viewport, { timeout: 3000 });
    await assertVisibleInsideViewport(dialog, 'Wall settings');
    await assertVisibleInsideViewport(dialog.getByRole('button', { name: 'Use this wall', exact: true }), 'Wall confirmation');
    await assertVisibleInsideViewport(dialog.getByRole('button', { name: 'Close', exact: true }), 'Wall close button');
    results.viewports.push(viewport);
  }
  await page.setViewportSize({ width: 390, height: 568 });
  await page.screenshot({ path: 'output/playwright/prelaunch-short-wall-settings-verified.png' });
  const opacity = dialog.getByRole('slider', { name: 'Room background photo opacity', exact: true });
  const initialOpacity = Number(await opacity.inputValue());
  await opacity.focus();
  await opacity.press('ArrowLeft');
  check(Number(await opacity.inputValue()) === initialOpacity - 1, 'Opacity responds to keyboard arrows');
  check(await opacity.getAttribute('aria-valuetext') === `${initialOpacity - 1}%`, 'Opacity announces the percentage');
  await opacity.press('ArrowRight');
  check(Number(await opacity.inputValue()) === initialOpacity, 'Restore the test opacity');
  results.keyboard.sliderArrows = true;
  results.keyboard.valueText = true;
  for (let i = 0; i < 22; i++) {
    await page.keyboard.press('Tab');
    // Base UI's focus sentinel redirects on the next frame at either edge.
    await page.waitForFunction(() => Boolean(document.activeElement?.closest('.wall-dialog')), undefined, { timeout: 1000 });
  }
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  results.keyboard.modalFocusAndEscape = true;
  await page.getByRole('navigation', { name: 'Mobile editing tools' }).getByRole('button', { name: 'Inspect', exact: true }).click();
  for (const name of ['Wall scale for S04-01', 'Rotation for S04-01']) {
    check(await page.getByRole('slider', { name, exact: true }).count() === 1, `Named slider: ${name}`);
  }
  check(await page.getByRole('switch', { name: 'Lock position for S04-01', exact: true }).count() === 1, 'Lock switch is named');
  results.namedControls.inspector = true;
  await page.getByRole('button', { name: 'Print pack', exact: true }).click();
  // Existing mobile print navigation exposes the paper controls separately.
  await page.locator('.mobile-print-nav').getByRole('button', { name: /settings/i }).click();
  check(await page.getByRole('combobox', { name: 'Print paper size', exact: true }).count() === 1, 'Paper size selector is named');
  check(await page.getByRole('slider', { name: 'Cut spacing', exact: true }).count() === 1, 'Cut spacing slider is named');
  check(await page.getByRole('switch', { name: 'Print crop marks', exact: true }).count() === 1, 'Crop marks switch is named');
  for (const name of ['Cut spacing', 'Page margin', 'Scale every Print Pack item from its original wall size']) {
    const visibleThumb = await page.getByRole('slider', { name, exact: true }).evaluate(input => {
      const thumb = input.closest('[data-slot="slider-thumb"]');
      const box = thumb?.getBoundingClientRect();
      return thumb && getComputedStyle(thumb).visibility === 'visible' && box?.width > 0 && box?.height > 0;
    });
    check(visibleThumb, `${name} thumb remains visible after the mobile panel switch`);
  }
  const spacing = page.getByRole('slider', { name: 'Cut spacing', exact: true });
  const originalSpacing = Number(await spacing.inputValue());
  await spacing.focus();
  await spacing.press('Home');
  check(Number(await spacing.inputValue()) === 0, 'Cut spacing reaches zero using the keyboard');
  await spacing.press('End');
  check(Number(await spacing.inputValue()) === 2, 'Cut spacing reaches its upper limit using the keyboard');
  await spacing.press('Home');
  for (let i = 0; i < Math.round(originalSpacing / .1); i++) await spacing.press('ArrowRight');
  check(Math.abs(Number(await spacing.inputValue()) - originalSpacing) < .001, 'Restore test cut spacing');
  results.keyboard.printSpacingEndpoints = true;
  results.namedControls.printPack = true;
  await page.screenshot({ path: 'output/playwright/prelaunch-mobile-print-sliders.png' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const motion = await page.locator('.mobile-tool-nav').evaluate(element => getComputedStyle(element).animationDuration);
  check(motion.split(',').every(value => Number.parseFloat(value) <= .01), 'Reduced-motion preference is respected');
  results.keyboard.reducedMotion = true;
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(value => { window.__cutroomAccessibilityCheck = value; }, results);
  return results;
}
