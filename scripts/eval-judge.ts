/**
 * LLM judge for explanation quality and F3 faithfulness (PRD §10.2).
 *
 * Judges every scenario reply in eval/out/tools-<variant>.json and every
 * compare answer in eval/out/rag-<variant>.jsonl. The judge model is
 * JUDGE_MODEL (default gpt-4o), not the chat model. The rubric is
 * eval/judge-prompt.md.
 *
 * Run:
 *   npx tsx scripts/eval-judge.ts --variant v1      writes eval/out/judge-v1.json
 *                                                   and, for v1, eval/out/judge-sample.md
 *   npx tsx scripts/eval-judge.ts --agreement       reads the marks in judge-sample.md
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import { pool, parseVariant } from '../eval/run';
import type { ScenarioRow } from './eval-tools';
import { SCENARIOS } from '../eval/scenarios';

const JUDGE_MODEL = process.env.JUDGE_MODEL ?? 'gpt-4o';
const SAMPLE = 'eval/out/judge-sample.md';

const Verdict = z.object({
  explanation_quality: z.number().int().min(1).max(5),
  faithful: z.boolean(),
  reason: z.string(),
});

type Item = { id: string; source: 'scenario' | 'rag'; question: string; contexts: string[]; answer: string; expected: string };
type Judged = Item & z.infer<typeof Verdict>;

const EXPECTED_FOR_SCENARIO = (id: string): string => {
  const s = SCENARIOS.find((x) => x.id === id);
  return s ? s.checklist.map((c) => c.label).join('; ') : '';
};

function loadItems(variant: string): Item[] {
  const items: Item[] = [];
  const toolsFile = `eval/out/tools-${variant}.json`;
  if (existsSync(toolsFile)) {
    const { rows } = JSON.parse(readFileSync(toolsFile, 'utf8')) as { rows: ScenarioRow[] };
    for (const r of rows) {
      items.push({
        id: r.id,
        source: 'scenario',
        question: r.turns.map((t) => t.user).join('\n'),
        contexts: r.contexts,
        answer: r.turns.map((t) => t.text).join('\n\n'),
        expected: EXPECTED_FOR_SCENARIO(r.id),
      });
    }
  }
  const ragFile = `eval/out/rag-${variant}.jsonl`;
  if (existsSync(ragFile)) {
    for (const l of readFileSync(ragFile, 'utf8').split('\n').filter(Boolean)) {
      const r = JSON.parse(l);
      if (r.kind !== 'compare') continue;
      items.push({ id: r.id, source: 'rag', question: r.question, contexts: r.contexts, answer: r.answer, expected: r.ground_truth });
    }
  }
  return items;
}

/** A fixed sample: every 5th item by id order. 20%, and the same items on every run. */
function sampleOf(items: Judged[]): Judged[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id)).filter((_, i) => i % 5 === 0);
}

async function judge(item: Item): Promise<Judged> {
  const system = readFileSync('eval/judge-prompt.md', 'utf8');
  const prompt =
    `QUESTION:\n${item.question}\n\nTOOL RESULTS:\n${item.contexts.join('\n\n') || '(no tool was called)'}\n\n` +
    `REPLY:\n${item.answer}\n\nEXPECTED:\n${item.expected}`;
  const { object } = await generateObject({ model: openai(JUDGE_MODEL), schema: Verdict, system, prompt, temperature: 0 });
  return { ...item, ...object };
}

function writeSample(judged: Judged[]) {
  const sample = sampleOf(judged);
  const body = sample
    .map(
      (j, i) =>
        `## ${i + 1}. ${j.id} (${j.source})\n\n**Question:** ${j.question}\n\n**Reply:**\n\n${j.answer
          .split('\n')
          .map((l) => `> ${l}`)
          .join('\n')}\n\n**Judge (${JUDGE_MODEL}):** quality ${j.explanation_quality}/5, faithful ${j.faithful}. ${j.reason}\n\nYour verdict (write agree or disagree after the colon): \n`,
    )
    .join('\n---\n\n');
  writeFileSync(
    SAMPLE,
    `# Judge sample: ${sample.length} of ${judged.length} items (20%)\n\n` +
      `Read each reply and the judge's grade. Write \`agree\` or \`disagree\` after "Your verdict:". Then run \`npx tsx scripts/eval-judge.ts --agreement\`.\n\n---\n\n${body}`,
  );
}

function agreement() {
  const text = readFileSync(SAMPLE, 'utf8');
  const marks = [...text.matchAll(/Your verdict[^:]*:\s*(agree|disagree)/gi)].map((m) => m[1].toLowerCase());
  const total = (text.match(/Your verdict/g) ?? []).length;
  const agree = marks.filter((m) => m === 'agree').length;
  console.log(`Marked ${marks.length} of ${total}. Agreement ${agree}/${marks.length}${marks.length ? ` = ${((100 * agree) / marks.length).toFixed(1)}%` : ''}`);
  writeFileSync('eval/out/judge-agreement.json', JSON.stringify({ marked: marks.length, total, agree }, null, 2));
}

async function main() {
  if (process.argv.includes('--agreement')) return agreement();
  const variant = parseVariant(process.argv);
  const items = loadItems(variant);
  console.log(`Judge ${JUDGE_MODEL}: ${items.length} items, prompt ${variant}`);
  const judged = await pool(items, 4, judge);
  writeFileSync(`eval/out/judge-${variant}.json`, JSON.stringify(judged.map(({ contexts, ...rest }) => rest), null, 2));
  const scen = judged.filter((j) => j.source === 'scenario');
  const comp = judged.filter((j) => j.source === 'rag');
  const mean = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : 'n/a');
  console.log(`Explanation quality, scenario replies: mean ${mean(scen.map((j) => j.explanation_quality))} (n=${scen.length})`);
  console.log(`F3 faithfulness, compare answers: ${comp.filter((j) => j.faithful).length}/${comp.length}`);
  console.log(`Faithful, all items: ${judged.filter((j) => j.faithful).length}/${judged.length}`);
  if (variant === 'v1') {
    writeSample(judged);
    console.log(`Wrote ${SAMPLE}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
