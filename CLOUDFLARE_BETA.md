# Cutroom private beta — deployment preparation

Prepared and checked locally on 21 October 2026. The private-beta URL was deployed on 22 October 2026. The authenticated asset-routing fix and secure hosted AI are deployed. On 23 October 2026 (Asia/Kolkata), both approved live AI smoke tests passed. The next local usability checkpoint is recorded below; it is not deployed. Stop for the user's manual feedback before deploying these changes, expanding access, or starting another checkpoint.

Beta: https://cutroom-private-beta.utkarshk0804.workers.dev

The project moved to:

`/path/to/CutRoom` (use your local checkout path)

## Ready locally

- Both AI routes validate Cloudflare Access identity, same-origin requests, actual streamed request size, and shared durable usage allowances.
- Allowances are 5 attempts/minute and 20 attempts/UTC day per identity, with 100 attempts/UTC day across the beta. Invalid/failed attempts count too. These are request allowances, not a monetary cap.
- Hosted AI requires `AI_ENABLED=true`. Set it to `false` to pause AI while manual editing remains available to invited users.
- The production Worker checks Access before the editor or static files can be served. The beta config runs the Worker before assets. Only the stable beta URL is enabled, behind Access; preview URLs remain disabled.
- The development exception only applies to a development build served over loopback HTTP. A production build on localhost still denies unconfigured access.
- Backups embed source images, including bundled samples and the room photo. Restore validates images and saves successfully before replacing the current project.
- Share app shares the application address. Actual design links are deferred; use a project backup for transfer.
- Preview, PDF and PNG/JPG use shared crop-mark geometry. Marks are clipped to blank paper; identification labels are omitted where they would touch a photo.

## Verification completed

- 95 unit tests and TypeScript checks passed, including four worker-first asset-routing regressions.
- `npm run check:beta` built the Worker and passed Wrangler's deployment dry run; no remote resources were created.
- The built Worker denied unconfigured HTML, static images, favicon, and both normal and alternate AI URLs. Denials were non-cacheable.
- Local AI routes rejected missing Origin headers; the sixth invalid request across the two features returned 429 with retry timing. No paid AI calls were made.
- Browser backup export/restore passed across separate origins and isolated profiles, with demo requests blocked on the receiving site. Images, IDs, groups, dimensions, wall settings and print rotations survived reload.
- PDF and PNG export passed for mixed sizes, grouped text/photos, a -90° image, and zero cut spacing. Pixel comparison found zero changed pixels inside photos when crop marks were toggled. The rendered A6 PDF was inspected.
- The browser workflow reported zero runtime errors. Moved font-cache paths were repaired; browser assets no longer refer to the old local folder.

Re-run the browser check using an installed Playwright module and Chrome:

```sh
CUTROOM_PLAYWRIGHT_PATH=/absolute/path/to/playwright/index.mjs \
CUTROOM_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node --experimental-strip-types tests/launch-workflow.browser.mjs
```

The default second origin is `http://[::1]:3000`; use `CUTROOM_TRANSFER_ORIGIN` if the dev server listens elsewhere. QA artifacts live in ignored `output/playwright/`.

## Hosted UI checkpoint: completed; user approved proceeding

Wrangler OAuth login succeeded on 22 October 2026. The sole account was confirmed as `49a801594716071baa92655b491f7e70` and is now explicitly selected in the private-beta source config. No extra plugin is required.

The user confirmed that initial beta access must be limited to their approved email address (omitted from public documentation), completed the exact-email Access policy instructions, and supplied the application's audience tag. Do not use an everyone rule or a Gmail-domain rule. Signed-out redirects prove Access interception, but do not independently prove every rule in the account-side allowlist; that policy was configured by the user and is not readable with the current Wrangler OAuth scopes.

The fresh private-beta build/dry run, all 91 tests, and TypeScript checks passed. A read-only deployment lookup confirmed that `cutroom-private-beta` did not already exist before the first upload attempt.

The first upload was blocked by error `10063` until the user initialized the Workers subdomain. The initial no-route upload then succeeded as version `905d91b8-59f2-4245-bbd9-75531ed9fa95`.

The initial protected-URL release was version `114ddc4a-3d40-451b-8a90-5aecf75a90ca`. Its signed-out tests passed, but the subsequent invited login exposed CSS/JS 404s: with `run_worker_first:true`, Vinext received build-asset requests that it expects Cloudflare to have already served. The unstyled server HTML loaded, but the client editor could not hydrate.

The UI-routing fix was released as version `2b39eb4f-d608-4e5b-9c93-7e5873298487`. `lib/beta-worker.ts` now checks Access first, then serves GET/HEAD requests under `/_next/static/` through the ASSETS binding. Pages, public files and API requests continue through Vinext. Missing build assets retain their 404. Worker-first protection was not disabled. The private build, all 95 tests, and TypeScript checks passed. An independent read-only routing review found no actionable regression.

Cloudflare's version readback confirms the audience/origin/team values, `AI_ENABLED:false`, the quota Durable Object, guarded assets, and no preview URL. Authenticated browser checks confirm CSS/JS 200 responses with correct MIME types, loaded Geist/Geist Mono fonts, no broken images, and completed project restoration. The light-theme colors, font families, panel geometry and three-column tray match localhost at the same viewport (apart from subpixel rounding). Print Pack opens and changes pages, Back to wall works, and Room preview/Blueprint switch correctly. The signed-in browser reported zero console errors or warnings in this verification session. Screenshots are in ignored `output/playwright/`. No project photos or geometry were edited for these checks.

Configured non-secret values:

- Origin: `https://cutroom-private-beta.utkarshk0804.workers.dev`
- Team: `https://purple-hill-caea.cloudflareaccess.com`
- Audience: `5f38b02df029ddcaffef3fb183c6fb4c4fe5136dddb21517b86ea25687808a3a`

Live signed-out checks passed for the editor, favicon, sample image, built JS/CSS, both AI POST endpoints, alternate API paths, and forged JWT/email headers (11 checks). All returned 302 to the expected team login with the matching audience; no app or asset response was served. An isolated browser confirmed the Cloudflare Access sign-in screen. No paid AI request was made and no OpenAI secret was uploaded.

After the routing fix, eight signed-out probes again returned the expected Access redirect, including CSS GET/HEAD, JavaScript, API POSTs and forged identity headers. Root/CSS/JS protection was rechecked on 23 October (Asia/Kolkata).

Transfer an existing design by downloading a project backup from localhost and importing it on the beta; browser-local storage does not automatically follow a new origin. Keep the localhost copy until restore and Print Pack are checked. Do not paste cookies, JWTs, account tokens or the OpenAI key into chat.

The hosted AI activation outcome is recorded below. No extra plugin was found or needed; Wrangler's OAuth scopes do not include Access policy management.

## Previous checkpoint: hosted AI activated

On 23 October 2026 (Asia/Kolkata), the user approved a US$5/month OpenAI project hard limit, retaining the shared 20 requests/day per-user allowance, and exactly two small billable smoke tests: one layout request and one cutout request using a synthetic test image. The user subsequently confirmed the provider limit setup and saved the API secret directly in Cloudflare. Billing settings are user-confirmed, not independently readable from this workspace. The user was informed that spend-limit enforcement can lag slightly.

- Read-only secret-name and version checks confirm `OPENAI_API_KEY` is present as `secret_text`. Its value was not read or printed. Never put it in chat, source, or plaintext Wrangler vars.
- Active release: `e08c13f8-68e1-475c-af4d-ad0209e9d0e5`. Readback confirms `AI_ENABLED:true`, the secret binding, shared quota Durable Object, guarded worker-first assets, and disabled preview URLs. The user's secret-save release immediately before activation was `3213c0b3-c1b9-4c9c-bb5e-da34843d0b97`.
- The existing `gpt-5.6-luna` model and output contracts are unchanged. Both live requests confirmed that the configured key/model work through the deployed routes. All 97 unit tests, TypeScript checks, and the private-beta build passed before activation.
- Both routes now distinguish billing/spend-limit 429 responses from temporary rate limits, without exposing raw provider errors. This error handling is deployed. Manual editing stays available if AI is paused or billing stops requests.
- Exactly two authenticated provider requests were sent, once each, without retries. No personal photos or saved-project data were sent, and no returned proposals were applied to the user's wall.
  - Layout: HTTP 200 in about 5 seconds. Three synthetic units (6×6 cm, 12×12 cm, and a 16×16 cm two-member group) were placed at normalized centres (2200,2200), (5000,5000), and (7800,7800). Checks passed for size-ordered rightward staircase, exact IDs, group as one placement, unchanged size contract, physical bounds, and no overlap.
  - Cutouts: HTTP 200 in about 6 seconds. A generated 640×440 four-panel sheet returned exactly four editable rectangles. Checks passed for unique panel matches, bounds, and no neighboring-panel bleed. Intersection-over-union against the fixture's actual panel bounds was at least 99.9%. This is one simple fixture, not a guarantee for every real collage.
- After activation, unauthenticated root, built CSS, built JavaScript, and both AI POST endpoints all returned 302 to the expected Cloudflare Access team. No paid request was made by those signed-out probes. The account-side exact-email policy remains user-configured as described above.
- A final authenticated reload restored the editor; CSS and JavaScript returned 200 with the expected MIME types. The browser reported zero console errors or warnings. Screenshot: ignored `output/playwright/hosted-ai-active.png`.
- Request allowances remain 5/minute, 20/user/UTC day, and 100/global/UTC day across both AI features. They are not monetary limits. Use `AI_ENABLED:false` and redeploy the current build if AI must be paused; preserve the secret and Access protection.
- Next: ask the user to try a real grouped layout and inspect/edit a real sheet's AI cutout preview. Wait for their feedback before proceeding to another checkpoint or expanding access.

References checked: [OpenAI spend limits](https://developers.openai.com/api/docs/guides/spend-limits), [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna), and [Cloudflare secret entry](https://developers.cloudflare.com/workers/configuration/secrets/).

## Current checkpoint: local usability review, 24 October 2026

Changes stay on localhost for manual review. The hosted beta remains on release `e08c13f8-68e1-475c-af4d-ad0209e9d0e5`; no deployment, Access changes, secret reads, or additional paid AI calls were made for this checkpoint.

- Wall settings now keep their header, close button, and confirmation inside short phone and landscape viewports. Only the settings body scrolls.
- Slider labels/value descriptions now reach the actual range inputs, not just their surrounding group. Added names for text controls, position locks, paper selectors, and crop marks.
- Sliders use percentage-based thumb positioning. The old measurement-dependent positioning could leave Print Pack thumbs hidden after a mobile panel switch; scale, spacing, and margin thumbs now remain visible and keyboard-operable.
- The existing light theme, motion style, print dimensions, and AI contracts are unchanged.

Verification:

- 97 unit tests, TypeScript checks, and the private-beta build/dry run passed.
- The isolated browser check passed at 320×568, 390×568, 390×844, 844×390, and 1440×900. It checked wall-dialog bounds, reachable confirmation/close controls, focus containment, Escape dismissal, slider arrows/value announcements, named inspector/print controls, mobile Print Pack thumb visibility, zero/max cut-spacing keyboard endpoints, and the mobile navigation's reduced-motion rule.
- The existing export/backup regression passed: PDF and PNG downloads, zero changed pixels inside photos when crop marks were toggled, embedded-image backup restore on another origin, and reload preservation. It reported zero runtime errors.
- Tests used isolated local browser data with AI endpoints blocked. They did not modify the user's normal saved project. This is focused Chrome coverage, not an accessibility certification or complete device/browser audit.

Manual checks and rerun instructions: `tests/USABILITY_CHECKPOINT.md`. Screenshots and export fixtures are ignored under `output/playwright/`.

### Recommended next safety checkpoint — not implemented here

1. **Concurrent tabs:** source review found that saving `projects/current` has no cross-tab revision check or ownership lock. Two tabs editing the same project can overwrite each other's changes. Add conflict detection/recovery before widening the beta. Until then, use one editor tab per origin and keep project backups.
2. **Stalled image loads:** source review found export/restore image loaders without a timeout or cancellation. A source that never finishes loading can leave a busy workflow waiting indefinitely. Add bounded loading and a recoverable error path; test these failures using synthetic blocked requests.

These risks were identified from code review, not by experimenting on the user's saved data. Resolve them in a separately agreed checkpoint; do not describe this beta as fully production-ready.

## Dependency audit note

The 21 October audit still reports 26 findings (3 critical, 17 high, 5 moderate, 1 low). Inspection mapped these to development, build, formatting and CLI dependencies; no affected implementation was identified in the current Worker/browser artifact. For example, the critical `proxy-addr` path is shadcn CLI → MCP SDK → Express, and the critical `tinypool` path belongs to the formatter. `source-map-js` is used by CSS build tooling. The generated Worker has no external npm packages (`vinext-externals.json` is empty).

Track tooling updates as maintenance and keep the development server on loopback. Do not run `npm audit fix --force`: the current proposed resolution includes downgrading Vinext and shadcn to incompatible old versions. This classification is limited to the inspected build; recheck if dependencies or deployed imports change.

## Deployment sequence after review

1. Use the dedicated `private-beta` build, not a Sites deployment. `npm run build:beta` reads `wrangler.private-beta.jsonc`; ordinary `npm run dev` keeps the local editor.
2. Confirm Worker name `cutroom-private-beta` and the account's `workers.dev` subdomain. Keep `workers_dev:false` and `preview_urls:false` for the initial upload. No custom domain is configured.
3. Create the Worker through an explicitly approved deployment, still without a public route. Configure Cloudflare Access for all traffic to this Worker and an explicit email allowlist.
4. Populate the source config's non-secret `APP_ORIGIN`, `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` with the real settings. Keep AI paused.
5. Enable only the stable URL, leaving preview URLs disabled. Build again and deploy the generated `dist/server/wrangler.json` artifact. The Worker guard remains closed if Access configuration is incomplete.
6. Check logged-out HTML, JS/CSS, images and AI routes; check a real invited login. Account-side Access policy and JWT forwarding cannot be verified by a local dry run.
7. Add `OPENAI_API_KEY` through Cloudflare's secret flow, set the agreed provider spending controls, then enable AI. Perform only the two consented live checks described above; additional paid tests require agreement.
8. Download a backup from the existing localhost browser, restore it on the hosted origin, and manually check the user's design and Print Pack before expanding access.

Useful commands after account configuration and deployment approval:

```sh
npm run check:beta
npx wrangler deploy --config dist/server/wrangler.json
npx wrangler secret put OPENAI_API_KEY --config dist/server/wrangler.json
```

Never upload `.env.local` or generated `.dev.vars` as an asset or source archive. Keep private keys out of Wrangler `vars`. Secrets are entered through the provider's secret prompt.

## Reference

- [Cloudflare Access for Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
- [Run the Worker before static assets](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)
- [Cloudflare Vite configuration](https://developers.cloudflare.com/workers/vite-plugin/reference/api/)

The current Access documentation notes that `ctx.access` is unavailable in Workers behind the Static Assets router. This app therefore retains explicit signed-JWT verification.
