import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getProductDetails, compareProducts } from '../lib/details';

test('PWR-001-06 is on file with its price and sheet', () => {
  const d = getProductDetails('PWR-001-06');
  assert.equal(d.status, 'on_file');
  assert.equal(d.products[0].price_php, 58719);
  assert.ok(d.sheet?.specs.some((s) => s.label === 'Rated AC output' && s.value === '1,800 W'));
});

test('MED-001-01 is not on file but keeps its price', () => {
  const d = getProductDetails('med-001-01');
  assert.equal(d.status, 'not_on_file');
  assert.equal(d.products[0].price_php, 43470);
  assert.equal(d.sheet, null);
});

test('an unknown code', () => {
  const d = getProductDetails('XXX-999-99');
  assert.equal(d.status, 'unknown_code');
  assert.deepEqual(d.products, []);
});

test('a conflict code returns both records, flagged', () => {
  const d = getProductDetails('FLA-001-13');
  assert.equal(d.products.length, 2);
  for (const p of d.products) assert.equal(p.data_quality_flag, 'duplicate_code_conflict');
});

test('compare aligns rows by label', () => {
  const c = compareProducts(['PWR-001-06', 'PWR-001-05']);
  const cap = c.rows.find((r) => r.label === 'Capacity');
  assert.deepEqual(cap?.values, ['1,440 Wh', '1,024 Wh']);
  assert.equal(c.products[0].price_php, 58719);
  assert.equal(c.products[1].sheet_slug, 'bluetti-premium-100-v2');
});

test('a label only one sheet has gives null in the other column', () => {
  const c = compareProducts(['PWR-001-06', 'PWR-001-08']);
  assert.deepEqual(c.rows.find((r) => r.label === 'Expansion')?.values, [null, 'takes an expansion battery']);
});

test('a conflict code compares with no price', () => {
  const c = compareProducts(['PWR-001-06', 'FLA-001-13']);
  assert.equal(c.products[1].price_php, null);
  assert.equal(c.products[1].data_quality_flag, 'duplicate_code_conflict');
  // M5 sheet row 45 covers FLA-001-13. The sheet gives specs, never a price.
  assert.equal(c.products[1].sheet_slug, 'headlight');
});

test('compare needs 2 to 4 known codes', () => {
  assert.throws(() => compareProducts(['PWR-001-06']), /2 to 4/);
  assert.throws(() => compareProducts(['PWR-001-01', 'PWR-001-02', 'PWR-001-03', 'PWR-001-04', 'PWR-001-05']), /2 to 4/);
  assert.throws(() => compareProducts(['PWR-001-06', 'XXX-999-99']), /XXX-999-99/);
});
