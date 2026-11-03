/**
 * The capstone's Upstash Redis client: session memory, tickets and caches
 * (later milestones). Reads UPSTASH_REDIS_REST_URL / _TOKEN.
 */
import { Redis } from '@upstash/redis';

export const redis = Redis.fromEnv();
