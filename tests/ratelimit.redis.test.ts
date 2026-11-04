/**
 * Needs Redis: npm run test:redis. Uses its own key prefix and a random IP.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.RATELIMIT_KEY_PREFIX = `test:rl:${Date.now()}`;
delete process.env.RATE_LIMIT_PER_MIN;

test('the 16th request in a minute is refused', async () => {
  const { checkRateLimit, DEFAULT_LIMIT_PER_MIN } = await import('../lib/ratelimit');
  const ip = `203.0.113.${Math.floor(Math.random() * 250)}`;
  for (let i = 1; i <= DEFAULT_LIMIT_PER_MIN; i++) {
    const r = await checkRateLimit(ip);
    assert.equal(r.error, null);
    assert.equal(r.ok, true, `request ${i} should pass`);
  }
  const over = await checkRateLimit(ip);
  assert.equal(over.ok, false);
  assert.ok(over.retryAfterS >= 1 && over.retryAfterS <= 60);
  // Another IP is not affected.
  assert.equal((await checkRateLimit('198.51.100.7')).ok, true);
});
