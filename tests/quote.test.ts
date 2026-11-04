import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuotation, type QuoteResult } from '../lib/quote';

const NOW = new Date('2026-11-05T02:00:00Z'); // 10:00 Thu 5 Nov in Manila

function ok(r: QuoteResult) {
  if (!r.ok) assert.fail(`expected a quote, got errors ${JSON.stringify(r.errors)}`);
  return r;
}

function errors(r: QuoteResult) {
  if (r.ok) assert.fail('expected errors, got a quote');
  return r.errors;
}

/** VATable + VAT must equal the total to the centavo. Compare in centavos to dodge float noise. */
function assertAddsUp(r: QuoteResult) {
  const { quote } = ok(r);
  assert.equal(Math.round(quote.vatable_sales_php * 100) + Math.round(quote.vat_php * 100), Math.round(quote.total_php * 100));
}

test('1 x PWR-001-06', () => {
  const r = buildQuotation([{ code: 'PWR-001-06', qty: 1 }], NOW);
  const { quote } = ok(r);
  assert.equal(quote.total_php, 58719);
  assert.equal(quote.vatable_sales_php, 52427.68);
  assert.equal(quote.vat_php, 6291.32);
  assertAddsUp(r);
});

test('2 x PWR-001-02', () => {
  const r = buildQuotation([{ code: 'PWR-001-02', qty: 2 }], NOW);
  const { quote } = ok(r);
  assert.equal(quote.lines[0].unit_price_php, 19899);
  assert.equal(quote.lines[0].line_total_php, 39798);
  assert.equal(quote.total_php, 39798);
  assert.equal(quote.vatable_sales_php, 35533.93);
  assert.equal(quote.vat_php, 4264.07);
  assertAddsUp(r);
});

test('three lines: PWR-001-06, 3 x FIR-001-10LBS, 5 x MED-001-01', () => {
  const r = buildQuotation(
    [
      { code: 'PWR-001-06', qty: 1 },
      { code: 'FIR-001-10LBS', qty: 3 },
      { code: 'MED-001-01', qty: 5 },
    ],
    NOW,
  );
  const { quote } = ok(r);
  assert.equal(quote.lines.length, 3);
  assert.equal(quote.total_php, 283329);
  assert.equal(quote.vatable_sales_php, 252972.32);
  assert.equal(quote.vat_php, 30356.68);
  assertAddsUp(r);
});

test('1 x MED-001-01 splits exactly', () => {
  const r = buildQuotation([{ code: 'MED-001-01', qty: 1 }], NOW);
  const { quote } = ok(r);
  assert.equal(quote.vatable_sales_php, 38812.5);
  assert.equal(quote.vat_php, 4657.5);
  assertAddsUp(r);
});

test('VATable plus VAT equals the total for every catalogue price (qty 7)', async () => {
  const { CATALOG } = await import('../lib/products');
  for (const p of CATALOG) {
    if (p.data_quality_flag === 'duplicate_code_conflict') continue;
    assertAddsUp(buildQuotation([{ code: p.code, qty: 7 }], NOW));
  }
});

test('merges repeated codes', () => {
  const { quote } = ok(
    buildQuotation(
      [
        { code: 'PWR-001-02', qty: 1 },
        { code: 'pwr-001-02', qty: 1 },
      ],
      NOW,
    ),
  );
  assert.equal(quote.lines.length, 1);
  assert.equal(quote.lines[0].qty, 2);
  assert.equal(quote.total_php, 39798);
});

test('rejects an unknown code', () => {
  assert.deepEqual(errors(buildQuotation([{ code: 'XXX-999-99', qty: 1 }], NOW)), [
    { code: 'XXX-999-99', reason: 'unknown_code' },
  ]);
});

test('rejects a conflict code', () => {
  assert.deepEqual(errors(buildQuotation([{ code: 'FLA-001-13', qty: 1 }], NOW)), [
    { code: 'FLA-001-13', reason: 'conflict_code' },
  ]);
});

test('rejects qty 0, -2 and 1.5', () => {
  for (const qty of [0, -2, 1.5]) {
    assert.deepEqual(errors(buildQuotation([{ code: 'PWR-001-06', qty }], NOW)), [
      { code: 'PWR-001-06', reason: 'bad_qty' },
    ]);
  }
});

test('rejects qty above 9999', () => {
  assert.deepEqual(errors(buildQuotation([{ code: 'PWR-001-06', qty: 10000 }], NOW)), [
    { code: 'PWR-001-06', reason: 'bad_qty' },
  ]);
  // Two lines of 5,000 merge into 10,000, which is also too many.
  assert.equal(
    errors(
      buildQuotation(
        [
          { code: 'MED-001-01', qty: 5000 },
          { code: 'MED-001-01', qty: 5000 },
        ],
        NOW,
      ),
    )[0].reason,
    'bad_qty',
  );
});

test('rejects 31 lines', async () => {
  const { CATALOG } = await import('../lib/products');
  const items = CATALOG.filter((p) => !p.data_quality_flag)
    .slice(0, 31)
    .map((p) => ({ code: p.code, qty: 1 }));
  assert.deepEqual(errors(buildQuotation(items, NOW)), [{ code: '', reason: 'too_many_lines' }]);
  assert.ok(buildQuotation(items.slice(0, 30), NOW).ok);
});

test('one bad line rejects the whole quote and names every bad line', () => {
  const errs = errors(
    buildQuotation(
      [
        { code: 'PWR-001-06', qty: 1 },
        { code: 'XXX-999-99', qty: 1 },
        { code: 'FLA-001-13', qty: 1 },
      ],
      NOW,
    ),
  );
  assert.deepEqual(errs.map((e) => e.reason).sort(), ['conflict_code', 'unknown_code']);
});

test('ref, date and valid_until 30 days later (Manila date)', () => {
  const { quote } = ok(buildQuotation([{ code: 'PWR-001-06', qty: 1 }], NOW));
  assert.equal(quote.date, '2026-11-05');
  assert.equal(quote.valid_until, '2026-12-05');
  assert.match(quote.ref, /^CTI-Q-20261105-[0-9A-Z]{4}$/);
  // 23:30 UTC on 4 Nov is already 5 Nov in Manila.
  assert.equal(ok(buildQuotation([{ code: 'PWR-001-06', qty: 1 }], new Date('2026-11-04T23:30:00Z'))).quote.date, '2026-11-05');
});

test('the draft note says VAT-inclusive and not an order', () => {
  const { quote } = ok(buildQuotation([{ code: 'PWR-001-06', qty: 1 }], NOW));
  assert.equal(
    quote.note,
    'Draft quotation: prices from the CTI masterlist, subject to confirmation by CTI sales. Not an order. All prices VAT-inclusive.',
  );
  assert.equal(quote.lines[0].name.length > 0, true);
});

test('bulk flags: a line above 50 units, a total above 500,000', () => {
  assert.deepEqual(ok(buildQuotation([{ code: 'PWR-001-06', qty: 1 }], NOW)).bulk, {
    line_over_50: false,
    total_over_500k: false,
  });
  assert.equal(ok(buildQuotation([{ code: 'MED-001-01', qty: 50 }], NOW)).bulk.line_over_50, false);
  assert.equal(ok(buildQuotation([{ code: 'FIR-001-10LBS', qty: 51 }], NOW)).bulk.line_over_50, true);
  // 9 x 58,719 = 528,471
  assert.deepEqual(ok(buildQuotation([{ code: 'PWR-001-06', qty: 9 }], NOW)).bulk, {
    line_over_50: false,
    total_over_500k: true,
  });
});
