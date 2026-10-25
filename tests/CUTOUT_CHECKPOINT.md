# Cutout reliability checkpoint

Scope: upload a sheet, edit or detect proposed cuts, review their isolated
previews, and explicitly approve the creation of new pieces. No publishing.

## Automated browser regression

Start the normal local server on port 3000, then run:

```sh
node tests/cutout-workflow.browser.mjs
```

The script uses Playwright from the test environment. If it is not installed in
this project, set `CUTROOM_PLAYWRIGHT_PATH` to an existing Playwright module's
absolute entry path. `CUTROOM_CHROME_PATH` can select an existing Chrome binary.
The script opens an isolated browser context and does not read or modify the
user's saved browser project. Screenshots are saved under ignored `work/`.

The AI endpoint is intercepted with deterministic success, error, delayed and
never-completing responses. This checks the app's request/response handling,
not live AI detection quality, model availability, billing or credentials.

Coverage:

- Late AI results cannot replace the Manual mode or a different sheet.
- Eight returned regions reach the approval gallery even without `points` on rectangles.
- Error messages support retry; a stalled request times out and releases controls.
- Heart and polygon drawing, all eight handles, and gallery-to-editor navigation.
- Source frame matches image proportions on desktop and narrow/short mobile screens.
- Grid cuts on an odd-sized source account for every pixel.
- Creating twice quickly adds one set only, and shaped PNGs preserve transparency.
- New pieces appear only after explicit approval.
- Mobile Cancel and Create buttons fit inside the dialog, side by side.

## Manual approval before the next checkpoint

1. Upload a real collage and choose **A sheet with many photos → AI detect**.
   Check the number of proposals and inspect each in **Preview cuts**. Detection
   is a proposal, so verify separation and edges using your own sheet.
2. Use **Edit regions** to move/resize a cut. Try a heart and a point-by-point
   outline, then **Add another** from the preview gallery.
3. Cancel a pending detection or switch to Manual. Try a different uploaded
   sheet and verify an older response cannot replace its cuts.
4. Create the cutouts once. Confirm the count, dimensions, edges and transparent
   areas. On a phone, confirm both approval buttons remain accessible.

Stop here for the user's feedback. Arrangement, Print Pack, backup/restore,
sharing and deployment are separate checkpoints.
