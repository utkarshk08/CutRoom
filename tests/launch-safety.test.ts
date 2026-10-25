import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { guardAiRequest, guardBetaRequest, verifyAccessIdentity, type AiAccessEnv } from '../lib/ai-access.ts';
import { consumeAiQuota, type QuotaState } from '../lib/ai-quota.ts';
import { readAiJson, AiRequestError } from '../lib/ai-request.ts';
import { printCropMarkSegments, PRINT_MARK_WIDTH_CM, isPrintAnnotationClear } from '../lib/print-annotations.ts';
import { portableProjectJson } from '../lib/project-backup.ts';
import { validateProjectDocument } from '../lib/project-document.ts';
import { DEMO_PIECES, printPlacementFootprint, type PrintPlacement } from '../lib/studio.ts';

test('AI identities require signed, unexpired tokens for this issuer and audience', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  const keys = createLocalJWKSet({ keys: [{ ...jwk, kid: 'test' }] });
  const issuer = 'https://test.cloudflareaccess.com';
  const token = (aud = 'beta', iss = issuer, expiry = '5m') => new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setSubject('test-user').setIssuer(iss).setAudience(aud).setIssuedAt().setExpirationTime(expiry).sign(privateKey);
  const valid = await token();
  assert.match(await verifyAccessIdentity(valid, issuer, 'beta', keys), /^[a-f0-9]{64}$/);
  for (const invalid of [await token('other'), await token('beta', 'https://other.example'), await token('beta', issuer, '-1m'), valid.slice(0, -10) + 'xxxxxxxxxx']) {
    await assert.rejects(verifyAccessIdentity(invalid, issuer, 'beta', keys));
  }
});

test('private beta protects page, assets and alternate API URLs before any routing', async () => {
  const configured = { APP_ORIGIN: 'https://wall.example', CF_ACCESS_TEAM_DOMAIN: 'https://test.cloudflareaccess.com', CF_ACCESS_AUD: 'beta' };
  for (const path of ['/', '/assets/editor.js', '/demo/cuts/phoebe.png', '/api//ai-layout']) {
    const request = new Request('https://wall.example' + path);
    assert.equal((await guardBetaRequest(request, {}, false))?.status, 503);
    const denied = await guardBetaRequest(request, configured, false);
    assert.equal(denied?.status, 401); assert.equal(denied?.headers.get('cache-control'), 'no-store');
  }
  const local = new Request('http://localhost:3000/');
  assert.equal(await guardBetaRequest(local, {}, true), null);
  assert.equal((await guardBetaRequest(local, {}, false))?.status, 503);
  assert.equal((await guardBetaRequest(new Request('http://192.168.0.2:3000/'), {}, true))?.status, 503);
  assert.equal((await guardBetaRequest(new Request('https://other.example/'), configured, false))?.status, 403);
});

test('AI fails closed without protection and cannot use the localhost exception in production', async () => {
  const req = (url = 'http://localhost:3000/api/ai-layout', origin = new URL(url).origin) => new Request(url, { method: 'POST', headers: { origin } });
  assert.equal((await guardAiRequest(req(), {}, false))?.status, 503);
  assert.equal((await guardAiRequest(req(), {}, true))?.status, 503);
  assert.equal((await guardAiRequest(req(undefined, 'https://evil.example'), {}, true))?.status, 403);
  assert.equal((await guardAiRequest(req(), { AI_ENABLED: 'false' }, true))?.status, 503);
  const hosted = { AI_ENABLED: 'true', APP_ORIGIN: 'https://wall.example', CF_ACCESS_AUD: 'beta', CF_ACCESS_TEAM_DOMAIN: 'https://test.cloudflareaccess.com' };
  const spoofed = req('https://wall.example/api/ai-cutouts');
  spoofed.headers.set('cf-access-authenticated-user-email', 'owner@example.com');
  assert.equal((await guardAiRequest(spoofed, hosted, false))?.status, 401);
  const limiter = (response: Response) => ({ AI_USAGE_LIMITER: { idFromName: () => 'one', get: () => ({ fetch: async () => response }) } }) as unknown as AiAccessEnv;
  assert.equal(await guardAiRequest(req(), limiter(Response.json({ allowed: true, retryAfter: 0 })), true), null);
  const denied = await guardAiRequest(req(), limiter(Response.json({ allowed: false, retryAfter: 50 })), true);
  assert.equal(denied?.status, 429); assert.equal(denied?.headers.get('retry-after'), '50');
  assert.equal((await guardAiRequest(req(), limiter(new Response('', { status: 500 })), true))?.status, 503);
});

test('AI quotas share per-minute, per-user-day and global-day budgets with UTC reset', () => {
  let state: QuotaState | undefined;
  for (let i = 0; i < 5; i++) state = consumeAiQuota(state, 'user', 1_000).state;
  assert.equal(consumeAiQuota(state, 'user', 1_001).decision.allowed, false);
  assert.equal(consumeAiQuota(state, 'user', 61_000).decision.allowed, true);
  state = undefined;
  for (let i = 0; i < 20; i++) state = consumeAiQuota(state, 'user', 61_000 * i).state;
  assert.equal(consumeAiQuota(state, 'user', 61_000 * 21).decision.allowed, false);
  assert.equal(consumeAiQuota(state, 'user', 86_400_000).decision.allowed, true);
  state = undefined;
  for (let i = 0; i < 100; i++) state = consumeAiQuota(state, 'user-' + i, 1_000).state;
  assert.equal(consumeAiQuota(state, 'new-user', 1_000).decision.allowed, false);
  assert.equal(state?.total, 100);
});

test('streamed JSON has real byte and duration bounds even with missing or false length headers', async () => {
  const make = (body: BodyInit, headers = {}) => new Request('http://localhost/api', { method: 'POST', body, headers: { 'content-type': 'application/json', ...headers }, duplex: 'half' } as RequestInit);
  assert.deepEqual(await readAiJson(make('{"ok":true}'), 20), { ok: true });
  for (const headers of [{}, { 'content-length': '1' }]) await assert.rejects(readAiJson(make('"' + 'x'.repeat(100) + '"', headers), 20), (e: unknown) => e instanceof AiRequestError && e.status === 413);
  await assert.rejects(readAiJson(make('broken'), 20), (e: unknown) => e instanceof AiRequestError && e.status === 400);
  await assert.rejects(readAiJson(make(new ReadableStream()), 20, 5), (e: unknown) => e instanceof AiRequestError && e.status === 408);
});

const placement = (xCm: number, yCm: number, sheetRotation: PrintPlacement['sheetRotation'] = 0): PrintPlacement => ({ instanceId: `${xCm}-${yCm}`, pieceId: 'test', order: 0, widthCm: 3, heightCm: 4, xCm, yCm, sheetRotation });
test('crop mark ink stays off all photos with zero/narrow gaps, rotation and zero margins', () => {
  for (const gap of [0, .05, .1, .2, .3, .6]) for (const rotation of [0, 90, -90, 180] as const) {
    const photos = [placement(1, 1, rotation)];
    const footprint = printPlacementFootprint(photos[0]);
    photos.push(placement(1 + footprint.widthCm + gap, 1));
    photos.push(placement(1, 1 + footprint.heightCm + gap));
    const marks = printCropMarkSegments(photos, 12, 12);
    assert.ok(marks.length > 0);
    const radius = PRINT_MARK_WIDTH_CM / 2;
    for (const mark of marks) {
      const ink = { x: Math.min(mark.x1, mark.x2) - radius, y: Math.min(mark.y1, mark.y2) - radius, w: Math.abs(mark.x2 - mark.x1) + radius * 2, h: Math.abs(mark.y2 - mark.y1) + radius * 2 };
      assert.ok(ink.x >= 0 && ink.y >= 0 && ink.x + ink.w <= 12 && ink.y + ink.h <= 12);
      for (const photo of photos) { const s = printPlacementFootprint(photo); assert.ok(ink.x + ink.w <= photo.xCm || ink.x >= photo.xCm + s.widthCm || ink.y + ink.h <= photo.yCm || ink.y >= photo.yCm + s.heightCm); }
    }
  }
  assert.deepEqual(printCropMarkSegments([placement(0, 0), placement(3, 0)], 6, 4), []);
  assert.equal(isPrintAnnotationClear({ x: 1, y: 1, w: 1, h: .2 }, [placement(0, 0)], 10, 10), false);
});

test('portable backups embed reused sample images once, preserve project data and fail without mutation', async () => {
  const original = validateProjectDocument({ pieces: [DEMO_PIECES[0], { ...DEMO_PIECES[0], id: 'copy', code: 'COPY' }], wall: { widthCm: 200, heightCm: 150, color: '#eeeeee', photo: DEMO_PIECES[0].src } }).project;
  const before = JSON.stringify(original); let calls = 0;
  const resolve = async () => { calls++; return 'data:image/png;base64,AAAA'; };
  const portable = JSON.parse(await portableProjectJson(original, resolve));
  assert.equal(calls, 1); assert.equal(portable.pieces[0].src, portable.wall.photo);
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual(portable.identity, JSON.parse(JSON.stringify(original.identity)));
  assert.deepEqual(portable.printGroups, original.printGroups);
  await assert.rejects(portableProjectJson(original, async () => { throw new Error('offline'); }), /offline/);
  await assert.rejects(portableProjectJson(original, resolve, 10), /safe backup limit/);
  assert.equal(JSON.stringify(original), before);
});
