// Private-beta request budgets, shared by BOTH AI features. These are request
// counts, not monetary limits; configure a separate OpenAI project spend cap.
export const AI_BETA_LIMITS = { perMinute: 5, perUserDay: 20, globalDay: 100 } as const;
export type QuotaState = { day: number; total: number; users: Record<string, { dayCount: number; recent: number[] }> };
export type QuotaDecision = { allowed: boolean; retryAfter: number; message?: string };

export function consumeAiQuota(previous: QuotaState | undefined, subject: string, now = Date.now()): { state: QuotaState; decision: QuotaDecision } {
  const day = Math.floor(now / 86_400_000);
  const state = previous?.day === day ? structuredClone(previous) : { day, total: 0, users: {} };
  const user = state.users[subject] ?? { dayCount: 0, recent: [] };
  user.recent = user.recent.filter(time => time > now - 60_000);
  const dailyRetry = Math.max(1, Math.ceil(((day + 1) * 86_400_000 - now) / 1000));
  if (state.total >= AI_BETA_LIMITS.globalDay) return { state, decision: { allowed: false, retryAfter: dailyRetry, message: 'The beta has reached its daily AI allowance. Manual editing is still available. Try again tomorrow.' } };
  if (user.dayCount >= AI_BETA_LIMITS.perUserDay) return { state, decision: { allowed: false, retryAfter: dailyRetry, message: 'You have reached your daily beta AI allowance. Manual editing is still available. Try again tomorrow.' } };
  if (user.recent.length >= AI_BETA_LIMITS.perMinute) return { state, decision: { allowed: false, retryAfter: Math.max(1, Math.ceil((user.recent[0] + 60_000 - now) / 1000)), message: 'Please wait a minute before asking AI again.' } };
  user.dayCount += 1; user.recent.push(now); state.users[subject] = user; state.total += 1;
  return { state, decision: { allowed: true, retryAfter: 0 } };
}
