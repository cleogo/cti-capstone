/**
 * Rate limit for /api/chat (PRD §13): a sliding window per IP, kept in Upstash
 * Redis, so the limit holds across serverless instances. It protects the
 * OpenAI budget on a public URL.
 *
 * Default: 15 requests a minute. RATE_LIMIT_PER_MIN changes it, for the cache
 * bench only. If Redis fails the request goes through ("fail open"): a Redis
 * outage must not take the chat down.
 */
import { Ratelimit } from '@upstash/ratelimit';
import { getRedis } from './redis';

export const DEFAULT_LIMIT_PER_MIN = 15;

let limiter: Ratelimit | null = null;
let limiterSize = 0;

function perMinute(): number {
  const n = Number(process.env.RATE_LIMIT_PER_MIN);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_LIMIT_PER_MIN;
}

/** The client IP. Vercel and most proxies set x-forwarded-for; the first entry is the client. */
export function clientIp(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0].trim() || headers.get('x-real-ip') || 'local';
}

export type LimitResult = { ok: boolean; retryAfterS: number; error: string | null };

export async function checkRateLimit(ip: string): Promise<LimitResult> {
  try {
    const size = perMinute();
    if (!limiter || limiterSize !== size) {
      limiter = new Ratelimit({
        redis: getRedis(),
        limiter: Ratelimit.slidingWindow(size, '1 m'),
        prefix: process.env.RATELIMIT_KEY_PREFIX ?? 'ratelimit:chat',
      });
      limiterSize = size;
    }
    const r = await limiter.limit(ip);
    return { ok: r.success, retryAfterS: Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)), error: null };
  } catch (e) {
    return { ok: true, retryAfterS: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
