import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TextStreamPart, ToolSet } from 'ai';
import { createAnswerGuard, reviewAnswer, failedChecks, FALLBACK, type GuardContext } from '../lib/guardrails/answer-guard';
import { GUARD_REPLIES } from '../lib/guardrails/input';

// No network: moderation and the rewrite are stubs.
const clean = async () => ({ flagged: false, categories: [] });
const results = [{ items: [{ code: 'PWR-001-06', price_php: 58719 }] }];

function ctx(over: Partial<GuardContext> = {}): GuardContext {
  return {
    userText: 'price of PWR-001-06?',
    moderate: clean,
    regenerate: async () => {
      throw new Error('rewrite must not run');
    },
    force: false,
    ...over,
  };
}

type Part = TextStreamPart<ToolSet>;
const step = (extra: Partial<Part> = {}) => ({ type: 'step-finish', ...extra }) as unknown as Part;

async function run(chunks: Part[], c: GuardContext): Promise<Part[]> {
  const src = new ReadableStream<Part>({
    start(controller) {
      for (const ch of chunks) controller.enqueue(ch);
      controller.close();
    },
  });
  const out: Part[] = [];
  const reader = src.pipeThrough(createAnswerGuard<ToolSet>(c)({ tools: {}, stopStream() {} })).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out.push(value);
  }
}

const textOf = (parts: Part[]) =>
  parts
    .filter((p) => p.type === 'text-delta')
    .map((p) => (p as { textDelta: string }).textDelta)
    .join('');

test('a grounded reply passes unchanged', async () => {
  const r = await reviewAnswer('PWR-001-06 is ₱58,719.00.', results, ctx());
  assert.deepEqual(r, { text: 'PWR-001-06 is ₱58,719.00.', events: [] });
});

test('an invented price is rewritten once', async () => {
  let calls = 0;
  let named: string[] = [];
  const r = await reviewAnswer(
    'PWR-001-06 is ₱45,999.00.',
    results,
    ctx({
      regenerate: async (_d, failed) => {
        calls++;
        named = failed;
        return 'PWR-001-06 is ₱58,719.00.';
      },
    }),
  );
  assert.equal(calls, 1);
  assert.deepEqual(named, ['₱45,999']);
  assert.equal(r.text, 'PWR-001-06 is ₱58,719.00.');
  assert.deepEqual(r.events, ['grounding:regenerated']);
});

test('a rewrite that still fails gives the fallback', async () => {
  const r = await reviewAnswer('₱1.00', results, ctx({ regenerate: async () => 'Still ₱2.00' }));
  assert.equal(r.text, FALLBACK);
  assert.deepEqual(r.events, ['grounding:regenerated', 'grounding:fallback']);
});

test('force fails every draft, so the fallback follows one rewrite', async () => {
  let calls = 0;
  const r = await reviewAnswer('Hello.', [], ctx({ force: true, regenerate: async () => (calls++, 'Hello again.') }));
  assert.equal(calls, 1);
  assert.equal(r.text, FALLBACK);
});

test('"certified" needs a tool result that says so', () => {
  assert.deepEqual(failedChecks('This AED is certified for hospitals.', results, ''), ['claim "certified" with no sheet that says so']);
  assert.deepEqual(failedChecks('This AED is certified for hospitals.', [{ text: 'CE certified' }], ''), []);
  assert.equal(failedChecks('It is approved for marine use.', results, '').length, 1);
});

test('moderation replaces a flagged reply', async () => {
  const r = await reviewAnswer('Some text.', [], ctx({ moderate: async () => ({ flagged: true, categories: ['violence'] }) }));
  assert.equal(r.text, GUARD_REPLIES.unsafe);
  assert.deepEqual(r.events, ['moderation:replaced']);
});

test('the transform passes tool chunks at once and holds text to step finish', async () => {
  const out = await run(
    [
      { type: 'tool-call', toolName: 'searchProducts', toolCallId: '1', args: {} } as unknown as Part,
      { type: 'tool-result', toolName: 'searchProducts', toolCallId: '1', args: {}, result: results[0] } as unknown as Part,
      step(),
      { type: 'text-delta', textDelta: 'PWR-001-06 costs ' },
      { type: 'text-delta', textDelta: '₱58,719.00. It is a portable power station.' },
      step(),
      { type: 'finish' } as unknown as Part,
    ],
    ctx(),
  );
  assert.deepEqual(
    out.map((p) => p.type),
    ['tool-call', 'tool-result', 'step-finish', 'text-delta', 'text-delta', 'text-delta', 'step-finish', 'finish'],
  );
  assert.equal(textOf(out), 'PWR-001-06 costs ₱58,719.00. It is a portable power station.');
  assert.ok(out.filter((p) => p.type === 'text-delta').every((p) => (p as { textDelta: string }).textDelta.length <= 20));
});

test('the transform never releases an ungrounded draft', async () => {
  const out = await run(
    [{ type: 'text-delta', textDelta: 'It costs ₱99.00.' }, step()],
    ctx({ regenerate: async () => 'It costs ₱98.00.' }),
  );
  assert.equal(textOf(out), FALLBACK);
});

test('session context counts as grounded', async () => {
  const out = await run(
    [{ type: 'text-delta', textDelta: 'Your saved list has PWR-001-02 × 2.' }, step()],
    ctx({ context: ['Saved quote list (code × qty): PWR-001-02 × 2'] }),
  );
  assert.equal(textOf(out), 'Your saved list has PWR-001-02 × 2.');
});
