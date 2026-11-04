/**
 * Answer guard (PRD §11, output layer): buffer, check, then stream.
 *
 * createAnswerGuard() is a streamText `experimental_transform`. Tool chunks
 * pass through at once, so the sources panel and the cards still appear
 * live. The text of each step is held. At step finish, reviewAnswer() runs:
 *   1. Grounding: every ₱ figure, code and watt figure must come from a tool
 *      result, the session context or the user's own message (lib/grounding.ts).
 *   2. Safety claim: "certified" or "approved for" needs the same word in a
 *      tool result (a sheet).
 *   3. Moderation on the text.
 * On a pass the text is released in chunks of 20 characters. If check 1 or
 * 2 fails, one generateText call rewrites the draft with the failed items
 * named. If the rewrite also fails, the client gets FALLBACK. If moderation
 * flags the text, the client gets the unsafe refusal.
 *
 * FORCE_UNGROUNDED=1 makes check 1 fail on every draft. It is a test switch
 * for the exit condition: the trace shows one rewrite, then the fallback.
 */
import { openai } from '@ai-sdk/openai';
import { generateText, type StreamTextTransform, type TextStreamPart, type ToolSet } from 'ai';
import { context as otelContext, type Context } from '@opentelemetry/api';
import { ungrounded } from '../grounding';
import { CHAT_MODEL } from '../model';
import { telemetry } from '../telemetry';
import { moderate as moderateText, type Moderation } from './moderation';
import { GUARD_REPLIES } from './input';

export const FALLBACK = 'Please confirm this with our sales team.';

const CLAIMS: { pattern: RegExp; word: string }[] = [
  { pattern: /\bcertified\b/i, word: 'certified' },
  { pattern: /\bapproved for\b/i, word: 'approved' },
];

export type GuardContext = {
  /** The latest user message, PII-masked. Its numbers count as grounded. */
  userText: string;
  /** Other grounded material: the session memory and earlier tool results in the chat. */
  context?: unknown[];
  /** Called once per event: "grounding:regenerated", "grounding:fallback", "moderation:replaced". */
  report?: (event: string, detail: string[]) => void;
  /** The OTel context of the request, so the rewrite call joins its trace. */
  otel?: Context;
  /** Test seams. The defaults call OpenAI. */
  regenerate?: (draft: string, failed: string[], toolResults: unknown[], userText: string) => Promise<string>;
  moderate?: (text: string) => Promise<Moderation>;
  force?: boolean;
};

/** The labels of every failed check. An empty list means the text passes. */
export function failedChecks(text: string, toolResults: unknown[], userText: string, force = false): string[] {
  const failed = ungrounded(text, toolResults, userText);
  // ponytail: the claim word may sit anywhere in a tool result, not only in a sheet. A product name that says "certified" also counts.
  const haystack = JSON.stringify(toolResults).toLowerCase();
  for (const c of CLAIMS) {
    if (c.pattern.test(text) && !haystack.includes(c.word)) failed.push(`claim "${c.word}" with no sheet that says so`);
  }
  if (force) failed.push('FORCE_UNGROUNDED');
  return failed;
}

const REWRITE_SYSTEM = `You correct a draft reply from the CTI product assistant. Some figures or claims in the draft have no support in the tool results.

Rules:
1. Rewrite the draft. Keep every figure that the tool results support.
2. Remove each item in <not_supported>, or replace it with the value from the tool results.
3. Do not add a price, product code or watt figure that the tool results do not hold.
4. Do not say that an item is certified or approved for a use unless the tool results say so.
5. Return only the corrected reply, with no comment about the correction.`;

async function defaultRegenerate(draft: string, failed: string[], toolResults: unknown[], userText: string, otel?: Context) {
  // ponytail: tool results are cut at 24,000 characters. A long searchProducts result can lose its last hits here.
  const results = JSON.stringify(toolResults).slice(0, 24000);
  const run = () =>
    generateText({
      model: openai(CHAT_MODEL),
      system: REWRITE_SYSTEM,
      prompt:
        `<user_message>\n${userText}\n</user_message>\n\n<tool_results>\n${results}\n</tool_results>\n\n` +
        `<draft>\n${draft}\n</draft>\n\n<not_supported>\n${failed.join('\n')}\n</not_supported>`,
      experimental_telemetry: telemetry('answer-guard-rewrite', { failed: failed.join(', ') }),
    });
  const { text } = await (otel ? otelContext.with(otel, run) : run());
  return text;
}

/** Check one step's text. Returns the text to release, and what fired. */
export async function reviewAnswer(
  text: string,
  toolResults: unknown[],
  ctx: GuardContext,
): Promise<{ text: string; events: string[] }> {
  if (text.trim() === '') return { text, events: [] };
  const force = ctx.force ?? process.env.FORCE_UNGROUNDED === '1';
  const mod = ctx.moderate ?? moderateText;
  const regenerate =
    ctx.regenerate ?? ((d: string, f: string[], r: unknown[], u: string) => defaultRegenerate(d, f, r, u, ctx.otel));
  const events: string[] = [];
  const emit = (event: string, detail: string[] = []) => {
    events.push(event);
    ctx.report?.(event, detail);
  };

  // Moderation runs while the grounding check and any rewrite run.
  let modPromise = mod(text);
  let out = text;
  const failed = failedChecks(text, toolResults, ctx.userText, force);
  if (failed.length > 0) {
    let second: string[];
    try {
      out = await regenerate(text, failed, toolResults, ctx.userText);
      second = failedChecks(out, toolResults, ctx.userText, force);
    } catch (e) {
      second = [`rewrite failed: ${e instanceof Error ? e.message : String(e)}`];
    }
    emit('grounding:regenerated', failed);
    if (second.length > 0) {
      emit('grounding:fallback', second);
      return { text: FALLBACK, events };
    }
    modPromise = mod(out);
  }
  const m = await modPromise;
  if (m.error) emit('moderation:error', [m.error]);
  if (m.flagged) {
    emit('moderation:replaced', m.categories);
    return { text: GUARD_REPLIES.unsafe, events };
  }
  return { text: out, events };
}

function* pieces(text: string, size = 20): Generator<string> {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
}

export function createAnswerGuard<TOOLS extends ToolSet>(ctx: GuardContext): StreamTextTransform<TOOLS> {
  return () => {
    let held = '';
    const results: unknown[] = [...(ctx.context ?? [])];
    const release = async (controller: TransformStreamDefaultController<TextStreamPart<TOOLS>>) => {
      if (held === '') return;
      const draft = held;
      held = '';
      const { text } = await reviewAnswer(draft, results, ctx);
      for (const p of pieces(text)) controller.enqueue({ type: 'text-delta', textDelta: p });
    };
    return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      async transform(chunk, controller) {
        if (chunk.type === 'text-delta') {
          held += chunk.textDelta;
          return;
        }
        if (chunk.type === 'tool-result') results.push((chunk as { result: unknown }).result);
        if (chunk.type === 'step-finish' || chunk.type === 'finish' || chunk.type === 'error') await release(controller);
        controller.enqueue(chunk);
      },
      async flush(controller) {
        await release(controller);
      },
    });
  };
}
