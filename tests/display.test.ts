import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Message } from 'ai';
import { BY_CODE } from '../lib/products';
import { sourcesFromMessage } from '../lib/sources';
import { createTools } from '../lib/tools';
import { MAX_SHOWN, displayedAnswer, pickChips, showProducts } from '../lib/display';

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

test('displayedAnswer adds one line per shown product', () => {
  const out = displayedAnswer('Two items match.', [
    { name: 'showProducts', result: showProducts(['PWR-001-06', 'FLA-001-13']) },
    { name: 'searchProducts', result: [] },
  ]);
  assert.match(out, /^Two items match\.\n/);
  assert.match(out, /PWR-001-06 · .+ · ₱58,719\.00/);
  assert.match(out, /FLA-001-13 · .+ · price to be confirmed by sales/);
});

test('displayedAnswer returns the text alone when nothing was shown', () => {
  assert.equal(displayedAnswer('Hi.', []), 'Hi.');
});

test('sources leave out showProducts results', () => {
  const message = {
    id: 'm1',
    role: 'assistant',
    content: '',
    toolInvocations: [
      { state: 'result', toolCallId: 't1', toolName: 'showProducts', args: {}, result: showProducts(['PWR-001-06']) },
    ],
  } as unknown as Message;
  assert.deepEqual(sourcesFromMessage(message), []);
});

test('an identical repeat of a search tool is refused', async () => {
  const t = createTools({ sessionId: null });
  const opts = { toolCallId: 'x', messages: [] } as never;
  const args = { max_price: 500 } as never;
  const first = (await t.filterProducts.execute(args, opts)) as { total_matching?: number };
  const again = (await t.filterProducts.execute(args, opts)) as { error?: string; message?: string };
  assert.equal(typeof first.total_matching, 'number');
  assert.equal(again.error, 'repeated_call');
  assert.match(again.message ?? '', /showProducts/);
});

const shown = (codes: string[]) => ({ toolName: 'showProducts', result: showProducts(codes) });

test('chips for several products', () => {
  assert.deepEqual(pickChips([shown(['PWR-001-06', 'PWR-001-05'])]).map((c) => c.prompt), [
    'Compare PWR-001-06 and PWR-001-05.',
    'Show cheaper options than these.',
    'Add PWR-001-06 to my quote.',
  ]);
});

test('chips for one product', () => {
  assert.deepEqual(pickChips([shown(['PWR-001-06'])]).map((c) => c.label), ['Show specs', 'Add to a quote']);
});

test('a conflict code gets no quote chip', () => {
  assert.deepEqual(pickChips([shown(['FLA-001-13'])]).map((c) => c.label), ['Show specs']);
});

test('a quotation wins over shown products', () => {
  const q = { toolName: 'buildQuotation', result: { ok: true } };
  assert.deepEqual(pickChips([shown(['PWR-001-06']), q]).map((c) => c.label), ['Add another item', 'Talk to sales']);
});

test('chips for a power-station recommendation', () => {
  const rec = { toolName: 'recommendPowerStation', result: { eligible: [{ code: 'PWR-001-03' }, { code: 'PWR-001-04' }], rejected: [] } };
  assert.deepEqual(pickChips([rec]).map((c) => c.prompt), ['Add PWR-001-03 to my quote.', 'Compare PWR-001-03 and PWR-001-04.']);
});

test('no chips for a plain answer', () => assert.deepEqual(pickChips([]), []));
