/**
 * Time to first answer token, with the M7 guards on and off (PRD §11 cost note).
 *
 * "Off": streamText as the route ran it before M7.
 * "On":  checkInput first, then streamText with the answer guard, as the route runs now.
 * Both use the production prompt, tools and model settings. Runs alternate
 * off and on, so a slow minute on the API hits both columns.
 *
 * Run:
 *   npx tsx scripts/guard-latency.ts            5 questions × 3 rounds
 *   npx tsx scripts/guard-latency.ts --rounds 1
 * Writes eval/out/guard-latency.json. The table goes into the M8 latency table.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
process.env.TICKET_KEY_PREFIX ??= 'eval:';

import { writeFileSync, mkdirSync } from 'node:fs';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { SYSTEM_PROMPT, PROMPT_VERSION } from '../lib/prompt';
import { createTools } from '../lib/tools';
import { CHAT_MODEL, CHAT_MODEL_SETTINGS, MAX_STEPS } from '../lib/model';
import { checkInput } from '../lib/guardrails/input';
import { createAnswerGuard } from '../lib/guardrails/answer-guard';

const QUESTIONS = [
  'How much is PWR-001-06?',
  'What are the specs of PWR-001-05?',
  'Compare PWR-001-06 and PWR-001-03',
  'What is a class K extinguisher used for?',
  'Can I get a discount on MED-001-01?',
];

type Run = { question: string; guard: boolean; inputMs: number; firstTokenMs: number | null; totalMs: number; events: string[]; text: string };

async function once(question: string, guard: boolean): Promise<Run> {
  const t0 = Date.now();
  let inputMs = 0;
  const events: string[] = [];
  if (guard) {
    await checkInput(question);
    inputMs = Date.now() - t0;
  }
  const result = streamText({
    model: openai(CHAT_MODEL, CHAT_MODEL_SETTINGS),
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: question }],
    tools: createTools({ sessionId: null }),
    maxSteps: MAX_STEPS,
    ...(guard ? { experimental_transform: createAnswerGuard({ userText: question, report: (e, d) => events.push(d.length ? `${e} (${d.join(', ')})` : e) }) } : {}),
  });
  let first: number | null = null;
  let text = '';
  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') {
      first ??= Date.now() - t0;
      text += part.textDelta;
    }
    if (part.type === 'error') throw part.error;
  }
  return { question, guard, inputMs, firstTokenMs: first, totalMs: Date.now() - t0, events, text };
}

function pct(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}

async function main() {
  const r = process.argv.indexOf('--rounds');
  const rounds = r >= 0 ? Number(process.argv[r + 1]) : 3;
  console.log(`Guard latency: ${QUESTIONS.length} questions × ${rounds} rounds, prompt ${PROMPT_VERSION}, ${CHAT_MODEL}\n`);
  const runs: Run[] = [];
  for (let i = 0; i < rounds; i++) {
    for (const q of QUESTIONS) {
      // Alternate the order, so neither mode always runs second.
      const order = i % 2 === 0 ? [false, true] : [true, false];
      for (const g of order) {
        const run = await once(q, g);
        runs.push(run);
        console.log(`  ${g ? 'on ' : 'off'}  first token ${String(run.firstTokenMs).padStart(6)} ms  total ${String(run.totalMs).padStart(6)} ms  ${q}${run.events.length ? `  [${run.events.join('; ')}]` : ''}`);
      }
    }
  }
  const row = (guard: boolean) => {
    const rs = runs.filter((x) => x.guard === guard);
    const ft = rs.map((x) => x.firstTokenMs ?? x.totalMs);
    const tot = rs.map((x) => x.totalMs);
    const inp = rs.map((x) => x.inputMs);
    return `| ${guard ? 'on' : 'off'} | ${rs.length} | ${pct(ft, 50)} | ${pct(ft, 95)} | ${pct(tot, 50)} | ${pct(tot, 95)} | ${guard ? pct(inp, 50) : '-'} |`;
  };
  console.log('\n| Guards | Runs | First token p50 (ms) | First token p95 (ms) | Total p50 (ms) | Total p95 (ms) | Input guard p50 (ms) |');
  console.log('|---|---|---|---|---|---|---|');
  console.log(row(false));
  console.log(row(true));
  mkdirSync('eval/out', { recursive: true });
  writeFileSync('eval/out/guard-latency.json', JSON.stringify({ model: CHAT_MODEL, prompt: PROMPT_VERSION, rounds, runs }, null, 2));
  console.log('\nWrote eval/out/guard-latency.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
