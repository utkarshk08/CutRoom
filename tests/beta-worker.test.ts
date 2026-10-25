import assert from 'node:assert/strict';
import test from 'node:test';
import { handleBetaRequest, type BetaWorkerEnv } from '../lib/beta-worker.ts';

const configured = {
  APP_ORIGIN: 'https://wall.example',
  CF_ACCESS_TEAM_DOMAIN: 'https://test.cloudflareaccess.com',
  CF_ACCESS_AUD: 'beta',
};

test('worker-first CSS, JS and fonts use the asset binding after admission', async () => {
  const files = [
    ['/_next/static/css/index.css', 'text/css'],
    ['/_next/static/chunks/editor.js', 'application/javascript'],
    ['/_next/static/media/editor.woff2', 'font/woff2'],
  ];
  for (const [path, type] of files) for (const method of ['GET', 'HEAD']) {
    const request = new Request(`http://localhost:3000${path}?v=test`, { method });
    const expected = new Response(method === 'HEAD' ? null : 'asset', { headers: { 'content-type': type, etag: 'test' } });
    let assetCalls = 0;
    const env: BetaWorkerEnv = { ASSETS: { fetch: async input => {
      assetCalls++;
      assert.equal(input, request);
      return expected;
    } } };
    const response = await handleBetaRequest(request, env, true, () => assert.fail('Build asset reached the page router'));
    assert.equal(response, expected);
    assert.equal(response.headers.get('content-type'), type);
    assert.equal(assetCalls, 1);
  }
});

test('beta admission runs before assets or page routing, including production loopback', async () => {
  const assets: BetaWorkerEnv['ASSETS'] = { fetch: async () => assert.fail('Denied request reached assets') };
  for (const path of ['/', '/_next/static/css/index.css', '/_next/static/chunks/editor.js', '/api/ai-layout']) {
    for (const method of ['GET', 'HEAD']) {
      const response = await handleBetaRequest(new Request('https://wall.example' + path, { method }), { ...configured, ASSETS: assets }, false, () => assert.fail('Denied request reached renderer'));
      assert.equal(response.status, 401);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  }
  const response = await handleBetaRequest(new Request('http://localhost:3000/_next/static/editor.js'), { ASSETS: assets }, false, () => assert.fail('Production loopback reached renderer'));
  assert.equal(response.status, 503);
});

test('pages, public files, API routes and non-read methods stay with the framework', async () => {
  const env: BetaWorkerEnv = { ASSETS: { fetch: async () => assert.fail('Non-build route reached asset binding') } };
  for (const [path, method] of [['/', 'GET'], ['/demo/photo.png', 'GET'], ['/api/ai-layout', 'POST'], ['/_next/static/editor.js', 'POST'], ['/_next/static-other/file', 'GET']]) {
    const expected = new Response('framework');
    assert.equal(await handleBetaRequest(new Request('http://localhost:3000' + path, { method }), env, true, () => expected), expected);
  }
  const expected = new Response('dev asset');
  assert.equal(await handleBetaRequest(new Request('http://localhost:3000/_next/static/editor.js'), {}, true, () => expected), expected);
});

test('missing build assets preserve the binding 404 instead of returning an HTML page', async () => {
  const expected = new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
  const response = await handleBetaRequest(new Request('http://localhost:3000/_next/static/missing.js'), { ASSETS: { fetch: async () => expected } }, true, () => assert.fail('Missing asset fell through to page router'));
  assert.equal(response, expected);
  assert.equal(response.status, 404);
});
