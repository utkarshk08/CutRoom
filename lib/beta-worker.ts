import { guardBetaRequest, type AiAccessEnv } from './ai-access.ts';

export type BetaWorkerEnv = AiAccessEnv & {
  ASSETS?: { fetch(request: Request): Promise<Response> };
};

/** Keep worker-first assets private, then dispatch build files to their binding. */
export async function handleBetaRequest(
  request: Request,
  env: BetaWorkerEnv,
  development: boolean,
  render: () => Response | Promise<Response>,
): Promise<Response> {
  const rejection = await guardBetaRequest(request, env, development);
  if (rejection) return rejection;

  // Vinext assumes existing build assets were served before its page router.
  // With run_worker_first enabled, we must serve them AFTER the Access check.
  if (env.ASSETS && (request.method === 'GET' || request.method === 'HEAD') && new URL(request.url).pathname.startsWith('/_next/static/')) {
    return env.ASSETS.fetch(request);
  }
  return render();
}
