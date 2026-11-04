/**
 * The capstone's Upstash Redis client: session memory, tickets and caches
 * (later milestones). Reads UPSTASH_REDIS_REST_URL / _TOKEN.
 *
 * Lazy on purpose: lib/tools.ts imports this module, and scripts such as
 * grade.ts load .env.local only after their imports resolve. A client built at
 * import time would read an empty env.
 */
import { Redis } from '@upstash/redis';

let client: Redis | null = null;

export function getRedis(): Redis {
  client ??= Redis.fromEnv();
  return client;
}
