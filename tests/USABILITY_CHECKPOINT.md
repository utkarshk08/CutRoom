# Local usability checkpoint

Scope: short-screen wall settings, named/keyboard-accessible controls, visible
mobile Print Pack sliders, and an export/backup regression. Existing visual
design retained. No deployment or billable AI requests.

## Automated checks

```sh
npm run typecheck
npm test
npm run check:beta
```

The beta command builds and performs a deployment **dry run** only. Do not run
the build concurrently with local browser checks: development hot reload can
interrupt an open modal or keyboard sequence.

With localhost on port 3000, use the installed Playwright CLI in a dedicated
test profile, never the user's normal browser profile. Load the bundled demo,
select the photo `S04-01`, and keep a room photo with nonzero opacity available.
The script temporarily adjusts opacity and cut spacing, then restores those
values. It leaves the test browser on mobile Print Pack settings.

```sh
playwright-cli -s=cutroom-prelaunch-qa run-code --filename tests/accessibility-workflow.browser-cli.js
playwright-cli -s=cutroom-prelaunch-qa eval '() => window.__cutroomAccessibilityCheck'
```

The same commands work with the installed Playwright skill's wrapper in place
of `playwright-cli`. The script requires localhost and blocks AI endpoints.
It checks five viewport sizes, modal focus/escape, accessible labels, slider
keyboard controls and visibility after switching mobile panels. Screenshots
are saved under ignored `output/playwright/`.

For the independent export/backup regression, supply an installed Playwright
module and Chrome if they are not already available through defaults:

```sh
CUTROOM_PLAYWRIGHT_PATH=/absolute/path/to/playwright/index.mjs \
CUTROOM_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node --experimental-strip-types tests/launch-workflow.browser.mjs
```

That script creates isolated contexts and synthetic test data. It verifies
PDF/PNG download, crop-mark separation from photos, portable backup import on
a second origin, and reload. It does not use personal photos or real AI.

## Your manual checkpoint

1. Open localhost in a short/narrow window. Open **Edit** beside the wall size.
   Scroll its settings: the title, close button, and **Use this wall** should
   stay reachable. Try Tab, arrow keys on opacity, and Escape.
2. At phone width, open **Print pack**, switch between **Sheet preview** and
   **Print settings**, and check that scale, cut spacing, and page margin have
   visible knobs. Drag them and try keyboard arrows. Zero cut spacing must
   still be supported.
3. Confirm the existing look and interactions still feel right. If anything
   appears clipped, report the window/device size and the panel involved.

Stop for feedback before updating the hosted beta. Recommended next work is
cross-tab save conflict protection and timeouts/recovery for stalled image
loading during export/restore. For now, use one editor tab per origin and keep
a downloaded project backup. Do not change the private Access allowlist.
