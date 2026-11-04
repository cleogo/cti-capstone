/**
 * trimHistory needs no Redis, so it lives here and `npm test` (and the
 * prebuild) runs it. The Redis cases are in session.redis.test.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trimHistory, stripPrices } from '../lib/session';

test('stripPrices drops every sentence that holds a price', () => {
  assert.equal(
    stripPrices('The client asked about FIR-001-10LBS. The FIR-001-10LBS is ₱45,999.00. They want 3 units. VAT was 12%.'),
    'The client asked about FIR-001-10LBS. They want 3 units.',
  );
  assert.equal(stripPrices('Total 5,000 PHP.'), '');
});

const msgs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: String(i), role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', content: `m${i}` }));

test('trimHistory keeps the last 12 messages', () => {
  const { kept, dropped } = trimHistory(msgs(20));
  assert.equal(kept.length, 12);
  assert.equal(dropped.length, 8);
  assert.equal(kept[0].content, 'm8');
  assert.equal(kept[11].content, 'm19');
  assert.equal(dropped[7].content, 'm7');
});

test('trimHistory drops nothing at or under the limit', () => {
  assert.equal(trimHistory(msgs(12)).dropped.length, 0);
  assert.equal(trimHistory(msgs(3)).kept.length, 3);
});
