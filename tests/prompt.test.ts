import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROMPTS, stripPlan } from '../lib/prompt';

test('stripPlan removes closed and unclosed plan blocks', () => {
  assert.equal(stripPlan('<plan>lookup, then recommend</plan>\nThe answer.'), 'The answer.');
  assert.equal(stripPlan('Answer.<plan>half a plan'), 'Answer.');
  assert.equal(stripPlan('No plan here.'), 'No plan here.');
});

test('the four prompts exist, and v2 is shorter than v1', () => {
  assert.ok(PROMPTS.v1 && PROMPTS.v2 && PROMPTS.v3 && PROMPTS.v4);
  assert.ok(PROMPTS.v2.length < PROMPTS.v1.length);
  assert.ok(PROMPTS.v3.includes('<plan>') && !PROMPTS.v2.includes('<plan>'));
});

test('no prompt gives a real price or product code in an example', () => {
  for (const v of ['v2', 'v3', 'v4'] as const) {
    // Worked examples use <placeholders>. A peso figure in them would be repeated to clients.
    const examples = PROMPTS[v].split('## Worked examples')[1]?.split('## Format')[0] ?? '';
    assert.ok(examples.length > 0);
    assert.doesNotMatch(examples, /₱\s?\d/);
  }
});

test('v4 routes products to showProducts and keeps the v3 plan rule', () => {
  assert.match(PROMPTS.v4, /showProducts/);
  assert.match(PROMPTS.v4, /<plan>/);
  assert.doesNotMatch(PROMPTS.v4, /compact table/);
});
