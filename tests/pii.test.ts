import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskPII } from '../lib/guardrails/pii';

test('masks a PH mobile with spaces', () => {
  const r = maskPII('call me 0917 123 4567 please');
  assert.equal(r.text, 'call me [PHONE] please');
  assert.deepEqual(r.found, ['PHONE']);
});

test('masks a +639 mobile', () => {
  assert.equal(maskPII('+639171234567').text, '[PHONE]');
  assert.equal(maskPII('09171234567').text, '[PHONE]');
});

test('masks an email', () => {
  const r = maskPII('send it to juan.dela-cruz@example.com.ph');
  assert.equal(r.text, 'send it to [EMAIL]');
  assert.deepEqual(r.found, ['EMAIL']);
});

test('masks a TIN', () => {
  assert.equal(maskPII('TIN 123-456-789-000').text, 'TIN [TIN]');
  assert.equal(maskPII('TIN 123-456-789').text, 'TIN [TIN]');
});

test('masks a Luhn-valid 16-digit number and keeps a Luhn-invalid one', () => {
  assert.equal(maskPII('card 4111 1111 1111 1111').text, 'card [CARD]');
  assert.equal(maskPII('card 4111-1111-1111-1111').text, 'card [CARD]');
  assert.equal(maskPII('ref 4111 1111 1111 1112').text, 'ref 4111 1111 1111 1112');
});

test('leaves product codes, prices, watts and quantities unchanged', () => {
  const s = 'Quote 3 × PWR-001-06 at ₱58,719.00, 1,800 W, and 5 MED-001-01. FIR-002-50LBS-AFFF too.';
  const r = maskPII(s);
  assert.equal(r.text, s);
  assert.deepEqual(r.found, []);
});

test('reports each kind once, in order of first mask', () => {
  const r = maskPII('a@b.co, 09171234567, c@d.co');
  assert.equal(r.text, '[EMAIL], [PHONE], [EMAIL]');
  assert.deepEqual(r.found, ['EMAIL', 'PHONE']);
});
