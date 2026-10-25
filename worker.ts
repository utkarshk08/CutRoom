import handler from 'vinext/server/fetch-handler';
import { handleBetaRequest, type BetaWorkerEnv } from './lib/beta-worker.ts';
import { consumeAiQuota, type QuotaState } from './lib/ai-quota.ts';

/** One small, strongly consistent allowance store for the capped private beta. */
export class AiUsageLimiter implements DurableObject {
  private state: DurableObjectState;
  constructor(state: DurableObjectState) { this.state = state; }
  async fetch(request: Request) {
    const { subject } = await request.json() as { subject?: string };
    if (typeof subject !== 'string' || !/^(local-development|[a-f0-9]{64})$/.test(subject)) return new Response('Invalid subject', { status: 400 });
    return this.state.storage.transaction(async transaction => {
      const previous = await transaction.get<QuotaState>('quota');
      const result = consumeAiQuota(previous, subject);
      if (result.decision.allowed) await transaction.put('quota', result.state);
      return Response.json(result.decision);
    });
  }
}

export default {
  async fetch(request: Request, env: BetaWorkerEnv, ctx: ExecutionContext) {
    // AI routes also enforce origin and shared quotas at the route boundary.
    return handleBetaRequest(request, env, import.meta.env.DEV, () => handler.fetch(request, env, ctx));
  },
};
