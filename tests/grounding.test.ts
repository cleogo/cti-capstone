import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractFigures, ungrounded } from '../lib/grounding';

const results = [{ items: [{ code: 'PWR-001-06', price_php: 58719, rated_w: 1800 }] }];

test('extractFigures finds pesos, codes and watts but not Wh', () => {
  const f = extractFigures('PWR-001-06 is ₱58,719.00 and gives 1,800 W from 1,440 Wh.');
  assert.deepEqual(f.pesos, [58719]);
  assert.deepEqual(f.codes, ['PWR-001-06']);
  assert.deepEqual(f.watts, [1800]);
});

test('flags an invented peso figure', () => {
  assert.deepEqual(ungrounded('PWR-001-06 costs ₱45,999.00.', results, 'price?'), ['₱45,999']);
});

test('passes figures that the tool results hold, with or without decimals', () => {
  assert.deepEqual(ungrounded('PWR-001-06 is ₱58,719 or ₱58,719.00. It gives 1,800 W.', results, 'price?'), []);
});

test('allows figures from the user message', () => {
  assert.deepEqual(ungrounded('Your fan uses 60 W.', results, 'my fan is 60 W'), []);
});

test('passes a greeting with no figures', () => {
  assert.deepEqual(ungrounded('Hello! How can I help you today?', [], 'hi'), []);
});

test('treats ₱58,719 and ₱58,719.00 as equal', () => {
  const r = [{ price_php: 58719 }];
  assert.deepEqual(ungrounded('₱58,719', r, ''), []);
  assert.deepEqual(ungrounded('₱58,719.00', r, ''), []);
});

test('the digits in a product code do not ground a figure', () => {
  assert.deepEqual(ungrounded('The price is ₱1.00 and it gives 6 W.', results, 'price of PWR-001-06?'), ['₱1', '6 W']);
});

test('flags a code no tool returned', () => {
  assert.deepEqual(ungrounded('Try PWR-009-99.', results, 'help'), ['PWR-009-99']);
});
