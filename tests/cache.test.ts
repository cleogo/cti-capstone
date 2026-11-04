import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exactKey, isCacheable, isPolicyAnswer, isStorable, versionTag, type CachedReply } from '../lib/cache';
import { CATALOG_VERSION, contentHash } from '../lib/version';

const parts = { prompt: 'v1', catalog: 'aaaaaaaaaaaa', model: 'gpt-4o-mini' };

test('exactKey ignores case, spacing and end punctuation', () => {
  assert.equal(exactKey('What is OSHC?', parts), exactKey('  what   is oshc ', parts));
});

test('exactKey changes when the prompt version changes', () => {
  assert.notEqual(exactKey('hello', parts), exactKey('hello', { ...parts, prompt: 'v2' }));
});

test('exactKey changes when the catalogue version changes', () => {
  assert.notEqual(exactKey('hello', parts), exactKey('hello', { ...parts, catalog: 'bbbbbbbbbbbb' }));
});

test('exactKey changes when the model changes', () => {
  assert.notEqual(exactKey('hello', parts), exactKey('hello', { ...parts, model: 'gpt-4o' }));
});

test('versionTag changes with each of prompt, catalogue and model', () => {
  const t = versionTag(parts);
  assert.notEqual(t, versionTag({ ...parts, prompt: 'v2' }));
  assert.notEqual(t, versionTag({ ...parts, catalog: 'bbbbbbbbbbbb' }));
  assert.notEqual(t, versionTag({ ...parts, model: 'gpt-4o' }));
});

test('CATALOG_VERSION is 12 hex characters', () => {
  assert.match(CATALOG_VERSION, /^[0-9a-f]{12}$/);
});

test('isCacheable: first turn only', () => {
  assert.equal(isCacheable('How much is MED-001-01?', 0), true);
  assert.equal(isCacheable('How much is MED-001-01?', 1), false);
});

test('skips cache when question holds a PII mask', () => {
  assert.equal(isCacheable('Price of PWR-001-06? call me [PHONE]', 0), false);
  assert.equal(isCacheable('Price of PWR-001-06? mail [EMAIL]', 0), false);
});

test('isCacheable: stock, quote and saved-list questions skip the cache', () => {
  assert.equal(isCacheable('Is PWR-001-06 in stock?', 0), false);
  assert.equal(isCacheable('Quote 2 of PWR-001-02', 0), false);
  assert.equal(isCacheable('What is in my saved list?', 0), false);
});

const reply = (text: string, toolCalls: CachedReply['toolCalls'] = []): CachedReply => ({ text, toolCalls, toolResults: [] });

test('isPolicyAnswer rejects a reply with a code, a peso figure or a watt figure', () => {
  assert.equal(isPolicyAnswer(reply('The PWR-001-06 is a good fit.')), false);
  assert.equal(isPolicyAnswer(reply('It costs ₱650.00.')), false);
  assert.equal(isPolicyAnswer(reply('It gives 1800 W.')), false);
  assert.equal(isPolicyAnswer(reply('It gives 1.8 kW.')), false);
});

test('isPolicyAnswer rejects a turn that called a tool', () => {
  assert.equal(isPolicyAnswer(reply('Here you go.', [{ toolCallId: 'c1', toolName: 'searchProducts', args: {} }])), false);
});

test('isPolicyAnswer accepts a warranty refusal', () => {
  assert.equal(
    isPolicyAnswer(reply('I do not have warranty terms on file. Our sales team can confirm them for you.')),
    true,
  );
});

test('isStorable rejects side-effect turns, guard events and degraded results', () => {
  const ok = reply('Hello. I can help with CTI products.');
  assert.equal(isStorable(ok, []), true);
  assert.equal(isStorable(ok, ['grounding:regenerated']), false);
  assert.equal(isStorable(ok, ['moderation:replaced']), false);
  assert.equal(
    isStorable(reply('Done.', [{ toolCallId: 'c1', toolName: 'escalateToSales', args: {} }]), []),
    false,
  );
  assert.equal(isStorable({ text: 'x', toolCalls: [], toolResults: [{ degraded: true }] }, []), false);
  assert.equal(isStorable(reply(''), []), false);
});

test('contentHash changes with the text and with the metadata', () => {
  const a = contentHash('t', { x: 1 });
  assert.equal(a, contentHash('t', { x: 1 }));
  assert.notEqual(a, contentHash('u', { x: 1 }));
  assert.notEqual(a, contentHash('t', { x: 2 }));
});
