/**
 * RAG evaluation, step 1 of 2 (PRD §10.1).
 *
 * Runs each golden question through the production prompt and tools, and
 * writes {question, answer, contexts, ground_truth} to eval/out/rag-<variant>.jsonl.
 * eval/ragas_eval.py scores that file.
 *
 * Run:
 *   npx tsx scripts/eval-rag.ts --variant v1
 *   npx tsx scripts/eval-rag.ts --variant v1 --only spec-01,price-03
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
process.env.TICKET_KEY_PREFIX ??= 'eval:';

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { startTracing } from './tracing';
import { runConversation, contextsOf, pool, parseVariant, traceUrl } from '../eval/run';
import { ungrounded } from '../lib/grounding';

type Golden = { id: string; kind: string; question: string; ground_truth: string };

async function main() {
  const variant = parseVariant(process.argv);
  const onlyArg = process.argv.indexOf('--only');
  const only = onlyArg >= 0 ? new Set(process.argv[onlyArg + 1].split(',')) : null;

  const golden: Golden[] = readFileSync('eval/golden.jsonl', 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const rows = only ? golden.filter((g) => only.has(g.id)) : golden;

  const sdk = startTracing();
  console.log(`RAG eval: ${rows.length} questions, prompt ${variant}`);

  const out = await pool(rows, 3, async (g) => {
    const t = await runConversation([g.question], { variant, id: g.id });
    const contexts = contextsOf(t.results);
    const bad = ungrounded(t.text, t.results.map((r) => r.result), g.question);
    console.log(
      `  ${g.id.padEnd(11)} ${t.error ? 'ERROR ' + t.error : `tools: ${t.toolNames.join(', ') || 'none'}`} | ${t.latencyMs} ms${bad.length ? ` | UNGROUNDED ${bad.join(', ')}` : ''}`,
    );
    return {
      id: g.id,
      kind: g.kind,
      question: g.question,
      answer: t.text,
      contexts,
      ground_truth: g.ground_truth,
      tools: t.toolNames,
      ungrounded: bad,
      tokens_in: t.tokensIn,
      tokens_out: t.tokensOut,
      latency_ms: t.latencyMs,
      trace: traceUrl(t.traceId),
      error: t.error,
    };
  });

  mkdirSync('eval/out', { recursive: true });
  const file = `eval/out/rag-${variant}${only ? '-partial' : ''}.jsonl`;
  writeFileSync(file, out.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const empty = out.filter((r) => r.contexts.length === 0).map((r) => r.id);
  console.log(`\nWrote ${file}`);
  console.log(`Answers with no tool context: ${empty.length ? empty.join(', ') : 'none'}`);
  console.log(`Answers with an ungrounded figure: ${out.filter((r) => r.ungrounded.length).length}`);
  await sdk.shutdown();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
