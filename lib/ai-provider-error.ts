import { AiRequestError } from './ai-request.ts';

const billingCodes = new Set([
  'insufficient_quota',
  'credit_balance_exhausted',
  'project_spend_limit_exceeded',
  'organization_spend_limit_exceeded',
  'organization_usage_limit_exceeded',
]);

/** Map provider failures to safe messages; never return its raw error text. */
export function classifyAiProviderError(status: number, body: unknown): AiRequestError {
  const error = body && typeof body === 'object' ? (body as { error?: unknown }).error : undefined;
  const fields = error && typeof error === 'object' ? error as { code?: unknown; type?: unknown } : {};
  const billing = [fields.code, fields.type].some(value => typeof value === 'string' && billingCodes.has(value));
  if (status === 429 && billing) {
    return new AiRequestError(429, 'billing_limit', 'AI billing or a spending limit has stopped requests. Check the OpenAI project billing and limits before trying again. Manual editing is still available.');
  }
  if (status === 429) return new AiRequestError(429, 'rate_limited', 'AI is receiving too many requests. Try again shortly.');
  if (status === 401 || status === 403) return new AiRequestError(503, 'configuration_error', 'The secure AI connection is not configured correctly.');
  return new AiRequestError(502, 'provider_error', 'The AI service is temporarily unavailable.');
}

export async function readAiProviderError(response: Response): Promise<AiRequestError> {
  // Only 429 needs its structured code. Do not read unrelated provider details.
  let body: unknown;
  if (response.status === 429) {
    try { body = await response.json(); } catch { /* Fall back to a safe generic rate-limit message. */ }
  }
  return classifyAiProviderError(response.status, body);
}
