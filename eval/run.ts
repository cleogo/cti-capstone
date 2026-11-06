/**
 * One conversation through the production prompt and tools.
 *
 * Shared by scripts/eval-rag.ts and scripts/eval-tools.ts. It imports
 * PROMPTS (lib/prompt.ts), createTools (lib/tools.ts) and the model settings
 * (lib/model.ts), so the evidence comes from the code that ships.
 *
 * Each call runs inside an OTel span. The span's trace id is the Langfuse
 * trace id, so every row in an evidence table can link to its trace.
 */
import { openai } from '@ai-sdk/openai';
import { generateText, type CoreMessage } from 'ai';
import { trace } from '@opentelemetry/api';
import { PROMPTS, stripPlan, type PromptVersion } from '../lib/prompt';
import { createTools } from '../lib/tools';
import { CHAT_MODEL, CHAT_MODEL_SETTINGS, MAX_STEPS } from '../lib/model';
import { telemetry } from '../lib/telemetry';
import { maskPII } from '../lib/guardrails/pii';
import { checkInput, GUARD_REPLIES } from '../lib/guardrails/input';
import { reviewAnswer } from '../lib/guardrails/answer-guard';
import { displayedAnswer } from '../lib/display';

export type ToolCall = { name: string; args: Record<string, unknown> };

export type TurnRecord = {
  user: string;
  /** The reply the client would see: V3 plan blocks removed, plus the showProducts lines (lib/display.ts). */
  text: string;
  calls: ToolCall[];
  results: { name: string; result: unknown }[];
};

export type Transcript = {
  variant: PromptVersion;
  turns: TurnRecord[];
  /** Flat views over all turns, for checks that do not care which turn. */
  text: string;
  calls: ToolCall[];
  results: { name: string; result: unknown }[];
  toolNames: string[];
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  traceId: string;
  error: string | null;
  /** Guards that fired (only with opts.guards): "injection", "grounding:regenerated" and so on. */
  guardrails: string[];
};

export function traceUrl(traceId: string): string {
  const base = (process.env.LANGFUSE_BASE_URL ?? '').replace(/\/$/, '');
  return base && traceId ? `${base}/trace/${traceId}` : '';
}

export async function runConversation(
  turns: string[],
  opts: { variant: PromptVersion; id: string; guards?: boolean },
): Promise<Transcript> {
  const tools = createTools({ sessionId: null, variant: opts.variant });
  const messages: CoreMessage[] = [];
  const records: TurnRecord[] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let traceId = '';
  let error: string | null = null;
  const guardrails: string[] = [];
  const t0 = Date.now();

  await trace.getTracer('cti-eval').startActiveSpan(`eval:${opts.id}`, async (span) => {
    traceId = span.spanContext().traceId;
    try {
      for (const user of turns) {
        // With opts.guards, the turn goes through the M7 guards as the route runs them:
        // mask, checkInput, and the answer check. The route checks the text of each
        // step. Here only the final text is checked: generateText has no transform.
        const masked = opts.guards ? maskPII(user) : { text: user, found: [] };
        guardrails.push(...masked.found.map((k) => `pii:${k}`));
        if (opts.guards) {
          const previous = records.at(-1)?.text;
          const v = await checkInput(masked.text, { previous });
          if (v.error) guardrails.push('input-guard:error');
          if (v.action !== 'allow' && v.guardrail) {
            guardrails.push(v.guardrail);
            const text = GUARD_REPLIES[v.guardrail];
            messages.push({ role: 'user', content: masked.text }, { role: 'assistant', content: text });
            records.push({ user, text, calls: [], results: [] });
            continue;
          }
        }
        messages.push({ role: 'user', content: masked.text });
        const res = await generateText({
          model: openai(CHAT_MODEL, CHAT_MODEL_SETTINGS),
          system: PROMPTS[opts.variant],
          messages,
          tools,
          maxSteps: MAX_STEPS,
          experimental_telemetry: telemetry('eval', { variant: opts.variant, scenario: opts.id }),
        });
        tokensIn += res.usage.promptTokens;
        tokensOut += res.usage.completionTokens;
        messages.push(...res.response.messages);
        const calls: ToolCall[] = [];
        const results: { name: string; result: unknown }[] = [];
        for (const step of res.steps) {
          for (const c of step.toolCalls ?? []) {
            calls.push({ name: c.toolName, args: c.args as Record<string, unknown> });
          }
          for (const r of step.toolResults ?? []) {
            results.push({ name: r.toolName, result: r.result });
          }
        }
        let text = stripPlan(res.text);
        if (opts.guards) {
          const earlier = [...records.flatMap((r) => [r.user, ...r.results.map((x) => x.result)]), ...results.map((r) => r.result)];
          const reviewed = await reviewAnswer(text, earlier, { userText: masked.text });
          guardrails.push(...reviewed.events);
          text = reviewed.text;
        }
        records.push({ user, text: displayedAnswer(text, results), calls, results });
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      span.end();
    }
  });

  const calls = records.flatMap((r) => r.calls);
  const results = records.flatMap((r) => r.results);
  return {
    variant: opts.variant,
    turns: records,
    text: records.map((r) => r.text).join('\n\n'),
    calls,
    results,
    toolNames: calls.map((c) => c.name),
    tokensIn,
    tokensOut,
    latencyMs: Date.now() - t0,
    traceId,
    error,
    guardrails,
  };
}

/** Run `items` with at most `n` in flight. Order of results matches order of items. */
export async function pool<T, R>(items: T[], n: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

export function parseVariant(argv: string[]): PromptVersion {
  const i = argv.indexOf('--variant');
  const v = i >= 0 ? argv[i + 1] : (process.env.PROMPT_VARIANT ?? 'v1');
  if (v !== 'v1' && v !== 'v2' && v !== 'v3' && v !== 'v4') throw new Error(`--variant must be v1, v2, v3 or v4. Got "${v}".`);
  return v;
}

/**
 * Tool results as plain text for RAGAS. One string per tool call, compact:
 * a product becomes one line, a guide or sheet hit keeps its text.
 */
export function contextsOf(results: { name: string; result: unknown }[]): string[] {
  const line = (p: Record<string, unknown>) =>
    `${p.code} | ${p.name} | ${p.price_php == null ? 'no price (conflicting records)' : `₱${Number(p.price_php).toLocaleString('en-US')}`}` +
    (p.data_quality_flag ? ` | flag: ${p.data_quality_flag}` : '');
  const out: string[] = [];
  for (const { name, result } of results) {
    if (Array.isArray(result)) {
      out.push(
        `${name}:\n` +
          result
            .map((h: Record<string, unknown>) =>
              h.doc_type === 'guide'
                ? `[guide] ${h.title} / ${h.heading}: ${h.text}`
                : h.doc_type === 'sheet'
                  ? `[sheet ${h.slug} / ${h.section}] ${h.text}`
                  : line(h),
            )
            .join('\n'),
      );
    } else if (result && typeof result === 'object') {
      const r = result as Record<string, unknown>;
      if (Array.isArray(r.items) || Array.isArray(r.products)) {
        const items = (r.items ?? r.products) as Record<string, unknown>[];
        const extra = r.total_matching != null ? ` (total_matching ${r.total_matching})` : '';
        out.push(`${name}${extra}:\n${items.map(line).join('\n')}${r.sheet ? `\nsheet: ${JSON.stringify(r.sheet)}` : ''}`);
        if (Array.isArray(r.rows)) out.push(`${name} rows: ${JSON.stringify(r.rows)}`);
      } else {
        out.push(`${name}: ${JSON.stringify(r)}`);
      }
    } else {
      out.push(`${name}: ${String(result)}`);
    }
  }
  return out;
}
