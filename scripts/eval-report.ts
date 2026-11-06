/**
 * Builds the M6 evidence files from the run records in eval/out/.
 *
 *   docs/evidence/rag-eval.md          RAGAS baseline (variant v1, the shipped prompt)
 *   docs/evidence/tool-eval.md         tool-eval baseline, judge results and agreement
 *   docs/evidence/prompt-comparison.md v1 to v4 side by side, and the choice
 *
 * Every number comes from eval/out/*.json(l). Nothing is typed by hand.
 * Text below the line `<!-- notes -->` in each file is hand-written and is
 * kept when the file is rebuilt.
 *
 * Run:  npm run eval:report
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { PROMPTS, PROMPT_VERSION } from '../lib/prompt';
import { summarize, type ScenarioRow } from './eval-tools';

const VARIANTS = ['v1', 'v2', 'v3', 'v4'] as const;
const NOTES = '<!-- notes -->';
const BASELINE = 'v1';

type RagRow = {
  id: string; kind: string; question: string; tools: string[]; ungrounded: string[];
  tokens_in: number; tokens_out: number; latency_ms: number; trace: string; error: string | null; contexts: string[];
};
type Ragas = { variant: string; judge: string; n: number; metrics: Record<string, number | null>; by_kind: Record<string, Record<string, number | null>>; rows: { id: string; kind: string; [m: string]: unknown }[] };
type Judged = { id: string; source: string; explanation_quality: number; faithful: boolean; reason: string };

const read = <T>(f: string): T | null => (existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as T) : null);
const rag = (v: string): RagRow[] | null =>
  existsSync(`eval/out/rag-${v}.jsonl`)
    ? readFileSync(`eval/out/rag-${v}.jsonl`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : null;
const tools = (v: string) => read<{ rows: ScenarioRow[] }>(`eval/out/tools-${v}.json`)?.rows ?? null;
const ragas = (v: string) => read<Ragas>(`eval/out/ragas-${v}.json`);
const judged = (v: string) => read<Judged[]>(`eval/out/judge-${v}.json`);

const pct = ([n, d]: number[]) => (d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)}% (${n}/${d})`);
const f3 = (x: number | null | undefined) => (x == null ? 'n/a' : x.toFixed(3));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const quant = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)];
};
const sec = (ms: number) => (ms / 1000).toFixed(1);
const link = (url: string, label = 'trace') => (url ? `[${label}](${url})` : 'n/a');

function keepNotes(file: string): string {
  if (!existsSync(file)) return '';
  const old = readFileSync(file, 'utf8');
  const i = old.indexOf(NOTES);
  return i >= 0 ? old.slice(i + NOTES.length) : '';
}
function write(file: string, body: string) {
  mkdirSync('docs/evidence', { recursive: true });
  writeFileSync(file, `${body.trimEnd()}\n\n${NOTES}${keepNotes(file) || '\n\n(none yet)\n'}`);
  console.log(`Wrote ${file}`);
}

// ------------------------------------------------------------------ rag-eval.md
function ragEval() {
  const v = BASELINE;
  const rows = rag(v);
  const rg = ragas(v);
  if (!rows || !rg) return console.log('rag-eval.md skipped: run eval-rag.ts and ragas_eval.py for v1 first');
  const names = Object.keys(rg.metrics);
  const kinds = Object.keys(rg.by_kind);
  const score = (id: string, m: string) => (rg.rows.find((r) => r.id === id)?.[m] as number | null | undefined) ?? null;
  let md = `# RAG evaluation: baseline (PRD §10.1)

Prompt **${v}** (the prompt the app ships), chat model \`${process.env.CHAT_MODEL ?? 'gpt-4o-mini'}\`, judge \`${rg.judge}\`, ${rg.n} golden questions (\`eval/golden.jsonl\`).
The run goes through \`createTools\` and \`PROMPTS\`, the production modules. Targets from PRD §10.1, set before the baseline: faithfulness ≥ 0.90, context recall ≥ 0.85.

## How to reproduce

\`\`\`bash
npx tsx scripts/eval-rag.ts --variant ${v}
eval\\.venv\\Scripts\\python eval/ragas_eval.py --variant ${v}
npm run eval:report
\`\`\`

## Result

| Metric | Mean | Target |
|---|---|---|
${names.map((n) => `| ${n} | ${f3(rg.metrics[n])} | ${n === 'faithfulness' ? '≥ 0.90' : n === 'context_recall' ? '≥ 0.85' : 'none'} |`).join('\n')}

## By question kind

| Kind | n | ${names.join(' | ')} |
|---|---|${names.map(() => '---').join('|')}|
${kinds.map((k) => `| ${k} | ${rows.filter((r) => r.kind === k).length} | ${names.map((n) => f3(rg.by_kind[k][n])).join(' | ')} |`).join('\n')}

## Run facts

- Answers with no tool call: ${rows.filter((r) => r.contexts.length === 0).map((r) => r.id).join(', ') || 'none'}
- Answers with a figure that no tool result or user message backs: ${rows.filter((r) => r.ungrounded.length).map((r) => `${r.id} (${r.ungrounded.join(', ')})`).join('; ') || 'none'}
- Answers that ended in an error: ${rows.filter((r) => r.error).map((r) => r.id).join(', ') || 'none'}
- Latency per question: p50 ${sec(quant(rows.map((r) => r.latency_ms), 0.5))} s, p95 ${sec(quant(rows.map((r) => r.latency_ms), 0.95))} s
- Tokens per question: mean ${Math.round(mean(rows.map((r) => r.tokens_in + r.tokens_out)))}

## Per question

| Id | Kind | Tools | ${names.join(' | ')} | Trace |
|---|---|---|${names.map(() => '---').join('|')}|---|
${rows.map((r) => `| ${r.id} | ${r.kind} | ${r.tools.join(', ') || 'none'} | ${names.map((n) => f3(score(r.id, n))).join(' | ')} | ${link(r.trace)} |`).join('\n')}

A score of n/a means RAGAS could not score the row (a judge call failed, or the answer holds no claim to score).
`;
  write('docs/evidence/rag-eval.md', md);
}

// ------------------------------------------------------------------ tool-eval.md
function toolEval() {
  const v = BASELINE;
  const rows = tools(v);
  if (!rows) return console.log('tool-eval.md skipped: run eval-tools.ts for v1 first');
  const m = summarize(rows);
  const j = judged(v);
  const agree = read<{ marked: number; total: number; agree: number }>('eval/out/judge-agreement.json');
  const scen = j?.filter((x) => x.source === 'scenario') ?? [];
  const comp = j?.filter((x) => x.source === 'rag') ?? [];
  const md = `# Tool evaluation: baseline (PRD §10.2)

Prompt **${v}**, chat model \`${process.env.CHAT_MODEL ?? 'gpt-4o-mini'}\`. ${rows.length} scenarios (\`eval/scenarios.ts\`): 16 normal, 8 designed to fail, 3 extra F9 trigger scenarios, and the F2 refusal set of 10 items with no knowledge sheet.
Checks are deterministic code. "Designed to fail" means the scenario puts the app in a failing condition. Graceful means no crash and no figure that no tool result backs.

## How to reproduce

\`\`\`bash
npx tsx scripts/eval-tools.ts --variant ${v}
npx tsx scripts/eval-judge.ts --variant ${v}
npx tsx scripts/eval-judge.ts --agreement
npm run eval:report
\`\`\`

## Result

| Metric | Result |
|---|---|
| Tool-selection accuracy | ${pct(m.selection)} |
| Argument accuracy | ${pct(m.args)} |
| Task completion, all scenarios | ${pct(m.completion)} |
| Task completion, 16 normal | ${pct(m.completionNormal)} |
| Task completion, 8 designed to fail | ${pct(m.completionFail)} |
| Graceful-failure rate (8 designed to fail) | ${pct(m.graceful)} |
| F2 refusal set (10 items, no sheet) | ${pct(m.refusalSet)} |
| F9 escalation recall (right reason when a trigger applies) | ${pct(m.escalationRecall)} |
| F9 false escalation (ticket when none should be made) | ${pct(m.falseEscalation)} |
| Latency per scenario | p50 ${sec(quant(rows.map((r) => r.latency_ms), 0.5))} s, p95 ${sec(quant(rows.map((r) => r.latency_ms), 0.95))} s |

## LLM judge (\`eval/judge-prompt.md\`)

${
  j
    ? `Judge \`${process.env.JUDGE_MODEL ?? 'gpt-4o'}\`. Explanation quality is graded 1 to 5 on the ${scen.length} scenario replies. F3 faithfulness is graded on the ${comp.length} compare answers from the RAG run.

| Item | Result |
|---|---|
| Explanation quality, mean | ${mean(scen.map((x) => x.explanation_quality)).toFixed(2)} / 5 |
| F3 faithfulness, compare answers | ${comp.filter((x) => x.faithful).length}/${comp.length} |
| Faithful, all judged items | ${j.filter((x) => x.faithful).length}/${j.length} |
| Hand check (20% sample, \`eval/out/judge-sample.md\`) | ${agree && agree.marked > 0 ? `agreement ${agree.agree}/${agree.marked} = ${((100 * agree.agree) / agree.marked).toFixed(1)}%` : 'not marked yet'} |

Items the judge marked not faithful: ${j.filter((x) => !x.faithful).map((x) => `${x.id} (${x.reason})`).join('; ') || 'none'}`
    : 'Not run yet.'
}

## Per scenario

| Id | Group | Result | Tools | Failed checks | Trace |
|---|---|---|---|---|---|
${rows
  .map(
    (r) =>
      `| ${r.id} | ${r.group} | ${r.completed ? 'pass' : 'FAIL'} | ${r.tools.join(', ') || 'none'} | ${r.checks.filter((c) => !c.ok).map((c) => c.label).join('; ') || (r.error ? 'error: ' + r.error.slice(0, 60).replace(/\|/g, '/') : '')} | ${link(r.trace)} |`,
  )
  .join('\n')}
`;
  write('docs/evidence/tool-eval.md', md);
}

// ------------------------------------------------------------------ prompt-comparison.md
type Col = {
  v: string; tokens: number; sel: number[]; args: number[]; comp: number[]; compNormal: number[]; graceful: number[]; refusal: number[];
  escRecall: number[]; escFalse: number[]; faith: number | null; rel: number | null; prec: number | null; rec: number | null; judgeFaith: number[];
  quality: number; tokPerQ: number; latP50: number; latP95: number; errors: number;
};

function column(v: string): Col | null {
  const t = tools(v);
  const r = rag(v);
  const g = ragas(v);
  if (!t || !r) return null;
  const m = summarize(t);
  const j = judged(v);
  const scen = j?.filter((x) => x.source === 'scenario') ?? [];
  const all = [...t.map((x) => ({ ms: x.latency_ms, tok: x.tokens_in + x.tokens_out })), ...r.map((x) => ({ ms: x.latency_ms, tok: x.tokens_in + x.tokens_out }))];
  return {
    v,
    tokens: Math.round(PROMPTS[v as keyof typeof PROMPTS].length / 4),
    sel: m.selection, args: m.args, comp: m.completion, compNormal: m.completionNormal, graceful: m.graceful, refusal: m.refusalSet,
    escRecall: m.escalationRecall, escFalse: m.falseEscalation,
    faith: g?.metrics.faithfulness ?? null, rel: g?.metrics.answer_relevancy ?? null,
    prec: g?.metrics.llm_context_precision_with_reference ?? null, rec: g?.metrics.context_recall ?? null,
    judgeFaith: j ? [j.filter((x) => x.faithful).length, j.length] : [0, 0],
    quality: scen.length ? mean(scen.map((x) => x.explanation_quality)) : 0,
    tokPerQ: Math.round(mean(all.map((x) => x.tok))),
    latP50: quant(all.map((x) => x.ms), 0.5), latP95: quant(all.map((x) => x.ms), 0.95),
    errors: t.filter((x) => x.error).length + r.filter((x) => x.error).length,
  };
}

function promptComparison() {
  const cols = VARIANTS.map(column).filter((c): c is Col => c !== null);
  if (cols.length === 0) return console.log('prompt-comparison.md skipped: no variant has both run records');
  const rate = (a: number[]) => (a[1] ? a[0] / a[1] : 0);
  // PRD §9: the best task completion that does not lose faithfulness.
  // "Does not lose" = RAGAS faithfulness within 0.02 of v1, and judge-faithful rate within 0.05 of v1.
  const base = cols.find((c) => c.v === BASELINE) ?? cols[0];
  const eligible = cols.filter(
    (c) => (c.faith ?? 0) >= (base.faith ?? 0) - 0.02 && rate(c.judgeFaith) >= rate(base.judgeFaith) - 0.05,
  );
  const pick = [...eligible].sort((a, b) => rate(b.comp) - rate(a.comp) || a.tokPerQ - b.tokPerQ)[0] ?? base;
  const row = (label: string, f: (c: Col) => string) => `| ${label} | ${cols.map(f).join(' | ')} |`;
  const md = `# Prompt comparison: v1 to v4 (PRD §9)

Same chat model (\`${process.env.CHAT_MODEL ?? 'gpt-4o-mini'}\`), same tools, same 30 golden questions and the same 37 scenarios for every variant. v4 also runs the 3 display scenarios, so its scenario counts are out of 40. The default prompt in the code is **${PROMPT_VERSION}**.

- **v1**: rules. The Week 14 rules plus the M2 to M5 rules, numbered, with named failure modes.
- **v2**: v1 condensed to the same 15 rules, plus 4 worked examples (a compare, a power sizing, a refusal, an escalation). Examples use placeholders, not real prices.
- **v3**: v2 plus a plan inside \`<plan>\` tags before the first tool call of a multi-step request. \`stripPlan\` removes it before the client sees the text.
- **v4**: v3 with the product rules replaced. Products reach the customer only as cards from \`showProducts\`, and the text holds no prices. The harnesses score \`displayedAnswer()\`: the text plus one line for each product card.

## How to reproduce

\`\`\`bash
npx tsx scripts/eval-rag.ts --variant v2
npx tsx scripts/eval-tools.ts --variant v2
eval\\.venv\\Scripts\\python eval/ragas_eval.py --variant v2
npx tsx scripts/eval-judge.ts --variant v2
npm run eval:report
\`\`\`

Repeat with \`v1\`, \`v3\` and \`v4\`. Every value below is read from \`eval/out/\`.

## Result

| | ${cols.map((c) => c.v).join(' | ')} |
|---|${cols.map(() => '---').join('|')}|
${row('System prompt size (about tokens)', (c) => String(c.tokens))}
${row('Task completion, all scenarios', (c) => pct(c.comp))}
${row('Task completion, 16 normal', (c) => pct(c.compNormal))}
${row('Tool-selection accuracy', (c) => pct(c.sel))}
${row('Argument accuracy', (c) => pct(c.args))}
${row('Graceful-failure rate', (c) => pct(c.graceful))}
${row('F2 refusal set', (c) => pct(c.refusal))}
${row('F9 escalation recall', (c) => pct(c.escRecall))}
${row('F9 false escalation', (c) => pct(c.escFalse))}
${row('RAGAS faithfulness', (c) => f3(c.faith))}
${row('RAGAS answer relevancy', (c) => f3(c.rel))}
${row('RAGAS context precision', (c) => f3(c.prec))}
${row('RAGAS context recall', (c) => f3(c.rec))}
${row('Judge: faithful items', (c) => pct(c.judgeFaith))}
${row('Judge: explanation quality (mean of 5)', (c) => (c.quality ? c.quality.toFixed(2) : 'n/a'))}
${row('Tokens per run (prompt plus reply, mean)', (c) => String(c.tokPerQ))}
${row('Latency per run, p50', (c) => `${sec(c.latP50)} s`)}
${row('Latency per run, p95', (c) => `${sec(c.latP95)} s`)}
${row('Runs that ended in an error', (c) => String(c.errors))}

Tokens and latency come from the run records. The tokens are the AI SDK usage that Langfuse also records, and each run links its trace in \`tool-eval.md\` and \`rag-eval.md\`. The variants ran one after another under the same load, with the RAG and tool runs in parallel inside each variant.

## Choice (PRD §9 rule)

The rule: the best task completion that does not lose faithfulness. "Does not lose" is fixed here as RAGAS faithfulness within 0.02 of v1 and judge-faithful rate within 5 points of v1.

Eligible: ${eligible.map((c) => c.v).join(', ') || 'none'}. **Chosen by the rule: ${pick.v}.**
`;
  write('docs/evidence/prompt-comparison.md', md);
}

ragEval();
toolEval();
promptComparison();
