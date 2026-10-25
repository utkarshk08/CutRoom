import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyAiProviderError, readAiProviderError } from '../lib/ai-provider-error.ts';
import { aiErrorResponse } from '../lib/ai-request.ts';

test('provider spend limits and exhausted credit are not described as temporary rate limits', async () => {
  for (const code of ['insufficient_quota', 'credit_balance_exhausted', 'project_spend_limit_exceeded', 'organization_spend_limit_exceeded', 'organization_usage_limit_exceeded']) {
    const failure = await readAiProviderError(Response.json({ error: { code, message: 'sensitive provider text' } }, { status: 429 }));
    assert.equal(failure.code, 'billing_limit');
    const response = aiErrorResponse(failure);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.has('retry-after'), false);
    const body = await response.text();
    assert.match(body, /billing and limits/);
    assert.doesNotMatch(body, /sensitive|shortly/);
  }
  assert.equal(classifyAiProviderError(429, { error: { type: 'insufficient_quota' } }).code, 'billing_limit');
});

test('transient or malformed provider errors retain safe generic messages', async () => {
  for (const body of [null, {}, { error: 'raw error' }, { error: { code: 'rate_limit_exceeded' } }, { error: { code: 123 } }]) {
    assert.equal(classifyAiProviderError(429, body).code, 'rate_limited');
  }
  assert.equal((await readAiProviderError(new Response('not JSON', { status: 429 }))).code, 'rate_limited');
  for (const status of [401, 403, 500, 502]) {
    const failure = await readAiProviderError(new Response('sensitive provider text', { status }));
    assert.equal(failure.status, status < 500 ? 503 : 502);
    assert.doesNotMatch(failure.message, /sensitive/);
  }
});
