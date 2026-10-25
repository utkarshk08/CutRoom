import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { aiErrorResponse, AiRequestError } from './ai-request.ts';
import type { QuotaDecision } from './ai-quota.ts';

export type AiAccessEnv = {
  APP_ORIGIN?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  AI_ENABLED?: string;
  AI_USAGE_LIMITER?: DurableObjectNamespace;
};
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function isLocalDevelopment(request: Request, development: boolean) {
  const url = new URL(request.url);
  return development && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

function hasAccessConfiguration(env: AiAccessEnv) {
  return Boolean(env.APP_ORIGIN && env.CF_ACCESS_AUD && /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.CF_ACCESS_TEAM_DOMAIN ?? ''));
}

/** Protect the whole private beta, including assets, before framework routing. */
export async function guardBetaRequest(request: Request, env: AiAccessEnv, development: boolean): Promise<Response | null> {
  if (isLocalDevelopment(request, development)) return null;
  const deny = (status: number, message: string) => new Response(message, { status, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } });
  if (!hasAccessConfiguration(env)) return deny(503, 'Cutroom private beta is awaiting access configuration.');
  const url = new URL(request.url);
  if (url.protocol !== 'https:' || url.origin !== env.APP_ORIGIN) return deny(403, 'This address is not authorized for the Cutroom beta.');
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token || token.length > 16_384) return deny(401, 'Sign in through your Cutroom beta invitation.');
  try { await verifyAccessIdentity(token, env.CF_ACCESS_TEAM_DOMAIN!, env.CF_ACCESS_AUD!); }
  catch { return deny(401, 'Your beta session could not be verified. Sign in again.'); }
  return null;
}

export async function verifyAccessIdentity(token: string, issuer: string, audience: string, keys?: JWTVerifyGetKey) {
  let keySet = keys ?? keySets.get(issuer);
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), { timeoutDuration: 5_000, cooldownDuration: 30_000, cacheMaxAge: 300_000 });
    keySets.set(issuer, keySet as ReturnType<typeof createRemoteJWKSet>);
  }
  const { payload } = await jwtVerify(token, keySet, { algorithms: ['RS256'], issuer, audience, requiredClaims: ['sub', 'exp', 'iat'], clockTolerance: 5 });
  if (!payload.sub || payload.sub.length > 256 || typeof payload.iat !== 'number' || payload.iat > Date.now() / 1000 + 5) throw new Error('Invalid identity');
  // Store a hash only; no emails, JWTs, briefs or photos enter quota storage.
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${issuer}:${payload.sub}`));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Hosted mode fails closed. The development bypass is a compile-time flag. */
export async function guardAiRequest(request: Request, env: AiAccessEnv, development: boolean): Promise<Response | null> {
  const reject = (status: number, code: string, message: string) => aiErrorResponse(new AiRequestError(status, code, message));
  if (request.method !== 'POST') return reject(405, 'method_not_allowed', 'Use POST for AI requests.');
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const isLocal = isLocalDevelopment(request, development);
  if (env.AI_ENABLED === 'false') return reject(503, 'ai_disabled', 'AI is paused. Manual editing is still available.');
  if (!origin || origin !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site') return reject(403, 'invalid_origin', 'Open Cutroom directly to use AI.');
  let subject = 'local-development';
  if (!isLocal) {
    if (env.AI_ENABLED !== 'true' || !hasAccessConfiguration(env)) {
      return reject(503, 'protection_not_configured', 'Hosted AI is disabled until its access protection is configured.');
    }
    if (url.protocol !== 'https:' || url.origin !== env.APP_ORIGIN) return reject(403, 'invalid_origin', 'This address is not authorized for AI requests.');
    const token = request.headers.get('cf-access-jwt-assertion');
    if (!token || token.length > 16_384) return reject(401, 'sign_in_required', 'Sign in through the private beta invitation to use AI.');
    try { subject = await verifyAccessIdentity(token, env.CF_ACCESS_TEAM_DOMAIN!, env.CF_ACCESS_AUD!); }
    catch { return reject(401, 'invalid_session', 'Your beta session could not be verified. Sign in again.'); }
  }
  if (!env.AI_USAGE_LIMITER) return reject(503, 'protection_not_configured', 'AI usage protection is unavailable. No AI request was sent.');
  try {
    const limiter = env.AI_USAGE_LIMITER.get(env.AI_USAGE_LIMITER.idFromName('private-beta-v1'));
    const response = await limiter.fetch('https://quota.internal/consume', { method: 'POST', body: JSON.stringify({ subject }), signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error('Quota unavailable');
    const decision = await response.json() as QuotaDecision;
    if (decision.allowed === true) return null;
    if (decision.allowed === false && Number.isFinite(decision.retryAfter) && decision.retryAfter > 0) {
      return aiErrorResponse(new AiRequestError(429, 'beta_limit', decision.message ?? 'AI allowance reached. Please try later.'), decision.retryAfter);
    }
    throw new Error('Invalid quota response');
  } catch { return reject(503, 'protection_unavailable', 'AI usage protection is temporarily unavailable. No AI request was sent.'); }
}
