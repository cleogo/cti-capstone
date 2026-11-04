/**
 * Runs against the real capstone Redis under a test key prefix.
 * Run: npm run test:redis
 */
process.env.SESSION_KEY_PREFIX = 'test:';

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getSession, saveSession, sessionKey, emptySession, SESSION_TTL_S } from '../lib/session';
import { getRedis } from '../lib/redis';

const made: string[] = [];
const newId = () => {
  const id = randomUUID();
  made.push(id);
  return id;
};

after(async () => {
  for (const id of made) await getRedis().del(sessionKey(id));
});

test('keys use the test prefix', () => {
  assert.equal(sessionKey('X'), 'test:session:X');
});

test('an unknown session reads as empty', async () => {
  const { state, dropped } = await getSession(newId());
  assert.deepEqual(state, emptySession());
  assert.deepEqual(dropped, []);
});

test('round trip', async () => {
  const id = newId();
  const s = {
    ...emptySession(),
    quote: [{ code: 'PWR-002-02', qty: 1 }],
    appliances: [{ name: 'TV', running_w: 60, surge_w: null, qty: 1, hours: 8 }],
    lastRecommendation: ['PWR-002-02'],
    summary: 'The client asked about brownout power.',
  };
  await saveSession(id, s);
  const { state, dropped } = await getSession(id);
  assert.deepEqual(state, s);
  assert.deepEqual(dropped, []);
});

test('TTL set', async () => {
  const id = newId();
  await saveSession(id, emptySession());
  const ttl = await getRedis().ttl(sessionKey(id));
  assert.ok(ttl > SESSION_TTL_S - 60 && ttl <= SESSION_TTL_S, `ttl ${ttl}`);
});

test('drops codes not in the catalogue', async () => {
  const id = newId();
  await saveSession(id, {
    ...emptySession(),
    quote: [
      { code: 'PWR-001-06', qty: 1 },
      { code: 'XXX-999-99', qty: 2 },
    ],
    lastRecommendation: ['PWR-002-02', 'OLD-000-01'],
  });
  const { state, dropped } = await getSession(id);
  assert.deepEqual(state.quote, [{ code: 'PWR-001-06', qty: 1 }]);
  assert.deepEqual(state.lastRecommendation, ['PWR-002-02']);
  assert.deepEqual(dropped.sort(), ['OLD-000-01', 'XXX-999-99']);
  // The cleaned state was saved, so the next read drops nothing.
  assert.deepEqual((await getSession(id)).dropped, []);
});
