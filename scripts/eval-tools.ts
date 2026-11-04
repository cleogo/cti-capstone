/**
 * Agentic tool evaluation (PRD §10.2).
 *
 * Runs the 24 scenarios, 3 extra F9 trigger scenarios and the 10-item F2 refusal set (eval/scenarios.ts)
 * through the production prompt and tools. Reports tool-selection accuracy,
 * argument accuracy, task completion, graceful-failure rate and the F9
 * escalation rates. Writes eval/out/tools-<variant>.json.
 *
 * Run:
 *   npx tsx scripts/eval-tools.ts --variant v1
 *   npx tsx scripts/eval-tools.ts --variant v1 --only single-lookup,taglish
 *   npx tsx scripts/eval-tools.ts --variant v1 --tag r2     a repeat run, written to tools-v1-r2.json
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
process.env.TICKET_KEY_PREFIX ??= 'eval:';

import { writeFileSync, mkdirSync } from 'node:fs';
import { startTracing } from './tracing';
import { runConversation, contextsOf, pool, parseVariant, traceUrl, type Transcript } from '../eval/run';
import { SCENARIOS, type Scenario } from '../eval/scenarios';
import { ungrounded } from '../lib/grounding';

export type ScenarioRow = {
  id: string;
  group: Scenario['group'];
  designedToFail: boolean;
  turns: { user: string; text: string }[];
  tools: string[];
  calls: { name: string; args: Record<string, unknown> }[];
  selection: boolean | null; // null: not scored
  args: boolean | null;
  checks: { label: string; ok: boolean }[];
  completed: boolean;
  ungrounded: string[];
  graceful: boolean | null; // only for designedToFail
  escalation: { expected: string | null; got: string | null; ok: boolean } | null;
  contexts: string[];
  tokens_in: number;
  tokens_out: number;
  latency_ms: number;
  trace: string;
  error: string | null;
};

function subsequence(want: string[], got: string[]): boolean {
  let i = 0;
  for (const g of got) if (g === want[i]) i++;
  return i === want.length;
}

function selectionOf(s: Scenario, t: Transcript): boolean | null {
  const scored = s.expectTools.some((l) => l.length > 0) || (s.forbidTools?.length ?? 0) > 0;
  if (!scored) return null;
  const perTurn = t.turns.length === s.turns.length;
  const ok = s.expectTools.every((want, i) => want.length === 0 || (perTurn && subsequence(want, t.turns[i].calls.map((c) => c.name))));
  const forbidden = (s.forbidTools ?? []).some((f) => t.toolNames.includes(f));
  return ok && !forbidden;
}

function argsOf(s: Scenario, t: Transcript): boolean | null {
  if (!s.expectArgs) return null;
  return Object.entries(s.expectArgs).every(([tool, want]) =>
    t.calls.some(
      (c) =>
        c.name === tool &&
        Object.entries(want).every(([k, v]) => (typeof v === 'function' ? (v as (x: unknown) => boolean)(c.args[k]) : c.args[k] === v)),
    ),
  );
}

function escalationOf(s: Scenario, t: Transcript): ScenarioRow['escalation'] {
  if (s.escalation === undefined) return null;
  const call = t.calls.find((c) => c.name === 'escalateToSales');
  const got = call ? String(call.args.reason) : null;
  return { expected: s.escalation, got, ok: got === s.escalation };
}

async function runOne(s: Scenario, variant: ReturnType<typeof parseVariant>): Promise<ScenarioRow> {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(s.env ?? {})) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  let t: Transcript;
  try {
    t = await runConversation(s.turns, { variant, id: s.id });
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
  const checks = s.checklist.map((c) => {
    let ok = false;
    try {
      ok = c(t);
    } catch {
      ok = false;
    }
    return { label: c.label, ok };
  });
  const bad = ungrounded(t.text, t.results.map((r) => r.result), s.turns.join('\n'));
  const completed = !t.error && checks.every((c) => c.ok);
  const row: ScenarioRow = {
    id: s.id,
    group: s.group,
    designedToFail: s.designedToFail,
    turns: t.turns.map((r) => ({ user: r.user, text: r.text })),
    tools: t.toolNames,
    calls: t.calls,
    selection: selectionOf(s, t),
    args: argsOf(s, t),
    checks,
    completed,
    ungrounded: bad,
    graceful: s.designedToFail ? !t.error && bad.length === 0 : null,
    escalation: escalationOf(s, t),
    contexts: contextsOf(t.results),
    tokens_in: t.tokensIn,
    tokens_out: t.tokensOut,
    latency_ms: t.latencyMs,
    trace: traceUrl(t.traceId),
    error: t.error,
  };
  const failed = checks.filter((c) => !c.ok).map((c) => c.label);
  console.log(
    `  ${completed ? 'PASS' : 'FAIL'}  ${s.id.padEnd(26)} ${t.toolNames.join(', ') || 'no tools'}` +
      (failed.length ? `\n        failed: ${failed.join('; ')}` : '') +
      (t.error ? `\n        error: ${t.error}` : '') +
      (bad.length ? `\n        ungrounded: ${bad.join(', ')}` : ''),
  );
  return row;
}

const pct = (n: number, d: number) => (d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)}% (${n}/${d})`);

export function summarize(rows: ScenarioRow[]) {
  const sel = rows.filter((r) => r.selection !== null);
  const arg = rows.filter((r) => r.args !== null);
  const fail = rows.filter((r) => r.designedToFail);
  const normal = rows.filter((r) => r.group === 'normal');
  const nosheet = rows.filter((r) => r.group === 'nosheet');
  const esc = rows.filter((r) => r.escalation && r.escalation.expected !== null);
  const noEsc = rows.filter((r) => r.escalation && r.escalation.expected === null);
  return {
    selection: [sel.filter((r) => r.selection).length, sel.length],
    args: [arg.filter((r) => r.args).length, arg.length],
    completion: [rows.filter((r) => r.completed).length, rows.length],
    completionNormal: [normal.filter((r) => r.completed).length, normal.length],
    completionFail: [fail.filter((r) => r.completed).length, fail.length],
    graceful: [fail.filter((r) => r.graceful).length, fail.length],
    refusalSet: [nosheet.filter((r) => r.completed).length, nosheet.length],
    escalationRecall: [esc.filter((r) => r.escalation!.ok).length, esc.length],
    falseEscalation: [noEsc.filter((r) => r.escalation!.got !== null).length, noEsc.length],
  };
}

async function main() {
  const variant = parseVariant(process.argv);
  const onlyArg = process.argv.indexOf('--only');
  const only = onlyArg >= 0 ? new Set(process.argv[onlyArg + 1].split(',')) : null;
  const list = only ? SCENARIOS.filter((s) => only.has(s.id)) : SCENARIOS;

  const sdk = startTracing();
  console.log(`Tool eval: ${list.length} scenarios, prompt ${variant}\n`);

  // Scenarios that set an env var run alone: process.env is shared.
  const parallel = list.filter((s) => !s.env);
  const serial = list.filter((s) => s.env);
  const a = await pool(parallel, 3, (s) => runOne(s, variant));
  const b: ScenarioRow[] = [];
  for (const s of serial) b.push(await runOne(s, variant));
  const rows = list.map((s) => [...a, ...b].find((r) => r.id === s.id)!);

  const m = summarize(rows);
  console.log('\n| Metric | Result |\n|---|---|');
  console.log(`| Tool-selection accuracy | ${pct(...(m.selection as [number, number]))} |`);
  console.log(`| Argument accuracy | ${pct(...(m.args as [number, number]))} |`);
  console.log(`| Task completion, all | ${pct(...(m.completion as [number, number]))} |`);
  console.log(`| Task completion, 16 normal | ${pct(...(m.completionNormal as [number, number]))} |`);
  console.log(`| Task completion, 8 designed to fail | ${pct(...(m.completionFail as [number, number]))} |`);
  console.log(`| Graceful-failure rate | ${pct(...(m.graceful as [number, number]))} |`);
  console.log(`| F2 refusal set (no sheet) | ${pct(...(m.refusalSet as [number, number]))} |`);
  console.log(`| F9 escalation recall | ${pct(...(m.escalationRecall as [number, number]))} |`);
  console.log(`| F9 false escalation | ${pct(...(m.falseEscalation as [number, number]))} |`);

  mkdirSync('eval/out', { recursive: true });
  const tagArg = process.argv.indexOf('--tag');
  const tag = tagArg >= 0 ? `-${process.argv[tagArg + 1]}` : '';
  const file = `eval/out/tools-${variant}${tag}${only ? '-partial' : ''}.json`;
  writeFileSync(file, JSON.stringify({ variant, rows }, null, 2));
  console.log(`\nWrote ${file}`);
  await sdk.shutdown();
}

// Run only when called directly, so eval-report.ts can import summarize().
if (process.argv[1]?.includes('eval-tools')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
