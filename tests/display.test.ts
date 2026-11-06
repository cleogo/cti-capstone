import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BY_CODE } from '../lib/products';
import { MAX_SHOWN, showProducts } from '../lib/display';

test('showProducts keeps order and drops duplicates', () => {
  const r = showProducts(['MED-001-01', 'PWR-001-06', 'MED-001-01']);
  assert.deepEqual(r.products.map((p) => p.code), ['MED-001-01', 'PWR-001-06']);
  assert.equal(r.products[1].price_php, 58719);
});

test('showProducts normalises case and spaces', () => {
  assert.equal(showProducts([' pwr-001-06 ']).products[0].code, 'PWR-001-06');
});

test('showProducts moves unknown codes out', () => {
  const r = showProducts(['PWR-001-06', 'XXX-999-99']);
  assert.deepEqual(r.unknown, ['XXX-999-99']);
  assert.equal(r.products.length, 1);
});

test('a conflict code shows once, flagged, with no price', () => {
  const r = showProducts(['FLA-001-13']);
  assert.equal(r.products.length, 1);
  assert.equal(r.products[0].price_php, null);
  assert.equal(r.products[0].data_quality_flag, 'duplicate_code_conflict');
});

test('showProducts caps at MAX_SHOWN', () => {
  const codes = [...BY_CODE.keys()].slice(0, 60);
  assert.equal(showProducts(codes).products.length, MAX_SHOWN);
});
