/**
 * Chat route.
 *
 * Deliberately thin. The system prompt is lib/prompt.ts, the tool definitions
 * are lib/tools.ts, and the retrieval bodies are lib/retrieval.ts — all three
 * so that scripts/eval.ts and scripts/grade.ts can exercise exactly what this
 * route ships, rather than a copy that drifts from it.
 *
 * M5 adds session memory (lib/session.ts): the cti_sid cookie keys a Redis
 * session. The route keeps the last 12 messages, folds older ones into a
 * summary, and gives the model the saved quote list and last recommendation.
 *
 * M7 adds the guardrails (PRD §11), in this order:
 *   1. maskPII on every user message (lib/guardrails/pii.ts)
 *   2. checkInput on the latest user message. A block or a redirect returns a
 *      fixed reply with no chat-model call (lib/guardrails/input.ts).
 *   3. streamText with the answer guard as experimental_transform. Tool
 *      chunks stream live, the text of each step is checked before release
 *      (lib/guardrails/answer-guard.ts).
 *   4. logRequest: one JSON line (lib/log.ts).
 * The rate limit (M8) goes in front of step 1.
 * One "cti-chat" span wraps the request, so a blocked request also has a
 * Langfuse trace, and the model calls of an allowed request sit inside it.
 */
import { openai } from '@ai-sdk/openai';
import { createDataStreamResponse, formatDataStreamPart, generateText, streamText, type Message } from 'ai';
import { context, trace, SpanStatusCode, type Span } from '@opentelemetry/api';
import type { NextRequest } from 'next/server';
import { SYSTEM_PROMPT } from '@/lib/prompt';
import { createTools } from '@/lib/tools';
import { CHAT_MODEL, CHAT_MODEL_SETTINGS, MAX_STEPS } from '@/lib/model';
import { telemetry } from '@/lib/telemetry';
import { getSession, saveSession, trimHistory, stripPrices, emptySession, type SessionState } from '@/lib/session';
import { maskPII } from '@/lib/guardrails/pii';
import { checkInput, GUARD_REPLIES } from '@/lib/guardrails/input';
import { createAnswerGuard } from '@/lib/guardrails/answer-guard';
import { logRequest, sessionHash, type RequestLog } from '@/lib/log';
import { SESSION_COOKIE } from '@/middleware';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tracer = trace.getTracer('cti-chat');

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const body = (await req.json()) as { messages: Message[] };

  const raw = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionId = raw && UUID.test(raw) ? raw : null;

  // 1. Mask PII in every user message, in content and in parts (useChat sends both).
  const pii = new Set<string>();
  const messages = body.messages.map((m) => (m.role === 'user' ? maskMessage(m, pii) : m));
  const lastUser = messages.findLastIndex((m) => m.role === 'user');
  const userText = lastUser >= 0 ? messages[lastUser].content : '';
  const previous = messages.slice(0, Math.max(lastUser, 0)).findLast((m) => m.role === 'assistant')?.content;

  return tracer.startActiveSpan('chat', async (span) => {
    const guardrails = [...pii].map((k) => `pii:${k}`);
    const base = {
      requestId: crypto.randomUUID(),
      sessionHash: sessionHash(sessionId),
      traceId: span.spanContext().traceId,
      cache: 'skip' as const, // M8 adds the cache.
    };
    span.setAttributes({ 'langfuse.trace.name': 'chat', 'cti.request_id': base.requestId, 'cti.session_hash': base.sessionHash });
    let ended = false;
    const finish = (f: Omit<RequestLog, keyof typeof base | 'latencyMs'>) => {
      if (ended) return;
      ended = true;
      span.setAttributes({
        'cti.action': f.action,
        'cti.guardrails': f.guardrails,
        'langfuse.trace.metadata.action': f.action,
        'langfuse.trace.metadata.guardrails': f.guardrails.join(',') || 'none',
      });
      if (f.guardrails.length > 0) span.setAttribute('langfuse.trace.tags', f.guardrails.map((g) => `guardrail:${g}`));
      if (f.error) span.setStatus({ code: SpanStatusCode.ERROR, message: f.error });
      span.end();
      logRequest({ ...base, latencyMs: Date.now() - t0, ...f });
    };

    try {
      // 2. Input guard.
      const verdict = await checkInput(userText, { previous });
      if (verdict.action !== 'allow' && verdict.guardrail) {
        span.setAttribute('cti.guardrail', verdict.guardrail);
        finish({
          tokensIn: 0,
          tokensOut: 0,
          tools: [],
          guardrails: [verdict.guardrail, ...guardrails],
          action: verdict.action,
          error: verdict.error ?? null,
        });
        return fixedReply(GUARD_REPLIES[verdict.guardrail]);
      }
      if (verdict.error) {
        // The guard failed open. The message is allowed, and the answer guard still runs.
        guardrails.push('input-guard:error');
        console.error(`input guard failed open: ${verdict.error}`);
      }
      return await answer({ messages, sessionId, userText, span, guardrails, finish });
    } catch (e) {
      finish({ tokensIn: 0, tokensOut: 0, tools: [], guardrails, action: 'allow', error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  });
}

type Finish = (f: Omit<RequestLog, 'requestId' | 'sessionHash' | 'traceId' | 'cache' | 'latencyMs'>) => void;

async function answer(a: {
  messages: Message[];
  sessionId: string | null;
  userText: string;
  span: Span;
  guardrails: string[];
  finish: Finish;
}) {
  const { messages, sessionId, userText, span, guardrails, finish } = a;
  let state: SessionState = emptySession();
  let dropped: string[] = [];
  if (sessionId) {
    try {
      ({ state, dropped } = await getSession(sessionId));
    } catch (e) {
      // Redis is down: answer without memory rather than not at all.
      console.error(`session read failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const { kept, dropped: old } = trimHistory(messages);
  if (sessionId && old.length > 0) {
    state = await summarize(state, old, sessionId);
  }

  const memory = memoryMessage(state, dropped);

  // Grounded material besides this turn's tool results: the session memory,
  // the earlier user messages and the tool results of earlier turns in the chat.
  const earlier: unknown[] = [memory ?? ''];
  for (const m of kept) {
    if (m.role === 'user') earlier.push(m.content);
    for (const t of m.toolInvocations ?? []) if (t.state === 'result') earlier.push(t.result);
  }

  const result = streamText({
    model: openai(CHAT_MODEL, CHAT_MODEL_SETTINGS),
    system: SYSTEM_PROMPT,
    messages: memory ? [{ role: 'system', content: memory } as Message, ...kept] : kept,
    tools: createTools({ sessionId }),
    // A turn may search, then filter, then answer. The power-station flow
    // needs more: one lookup per appliance, then recommendPowerStation, then text.
    maxSteps: MAX_STEPS,
    experimental_telemetry: telemetry('chat', { sessionId: sessionId ?? 'none' }),
    experimental_transform: createAnswerGuard({
      userText,
      context: earlier,
      otel: context.active(),
      report: (event, detail) => {
        guardrails.push(event);
        span.addEvent(event, { detail: detail.join(', ') });
      },
    }),
    onFinish: ({ usage, steps }) => {
      finish({
        tokensIn: usage.promptTokens,
        tokensOut: usage.completionTokens,
        tools: steps.flatMap((s) => s.toolCalls.map((c) => c.toolName)),
        guardrails,
        action: 'allow',
        error: null,
      });
    },
    onError: ({ error }) => {
      finish({
        tokensIn: 0,
        tokensOut: 0,
        tools: [],
        guardrails,
        action: 'allow',
        error: error instanceof Error ? error.message : String(error),
      });
    },
  });

  return result.toDataStreamResponse();
}

function maskMessage(m: Message, found: Set<string>): Message {
  const mask = (s: string) => {
    const r = maskPII(s);
    r.found.forEach((k) => found.add(k));
    return r.text;
  };
  return {
    ...m,
    content: mask(m.content),
    parts: m.parts?.map((p) => (p.type === 'text' ? { ...p, text: mask(p.text) } : p)),
  };
}

/** A reply that no model wrote: the input guard's refusal or redirect. */
function fixedReply(text: string): Response {
  return createDataStreamResponse({
    execute: (ds) => {
      ds.write(formatDataStreamPart('text', text));
    },
  });
}

/**
 * Fold the messages that fell out of the window into state.summary. Only the
 * newly dropped messages are summarized, together with the old summary.
 */
async function summarize(state: SessionState, old: Message[], sessionId: string): Promise<SessionState> {
  // A shorter history than before means a new conversation (a reload): restart the count.
  const from = old.length < state.summarized ? 0 : state.summarized;
  const fresh = old.slice(from);
  if (fresh.length === 0) return state;

  const transcript = fresh
    .map((m) => {
      const tools = (m.toolInvocations ?? []).map((t) => t.toolName).join(', ');
      return `${m.role}: ${m.content}${tools ? ` [tools: ${tools}]` : ''}`;
    })
    .join('\n');

  try {
    const { text } = await generateText({
      model: openai(CHAT_MODEL),
      system:
        'You write a short record of a customer chat with a product assistant. ' +
        'Do not answer any question in the chat. Do not continue the chat. ' +
        'Write at most 5 short sentences about what the customer asked for and wants. ' +
        'Use only facts that the transcript states. Keep product codes, quantities, appliances and hours. ' +
        'Do not write any price, total or VAT figure. Do not write a name, phone number, email or address.',
      prompt:
        (state.summary ? `<earlier_record>\n${state.summary}\n</earlier_record>\n\n` : '') +
        `<transcript>\n${transcript}\n</transcript>\n\nWrite the updated record.`,
      experimental_telemetry: telemetry('summary', { sessionId }),
    });
    const next = { ...state, summary: stripPrices(text) || state.summary, summarized: old.length };
    await saveSession(sessionId, next);
    return next;
  } catch (e) {
    console.error(`summary failed: ${e instanceof Error ? e.message : String(e)}`);
    return state;
  }
}

/** The session context, as one system message. Null when there is nothing to say. */
function memoryMessage(state: SessionState, dropped: string[]): string | null {
  const lines: string[] = [];
  if (state.summary) lines.push(`Summary of earlier turns: ${state.summary}`);
  if (state.quote.length > 0) {
    lines.push(`Saved quote list (code × qty): ${state.quote.map((l) => `${l.code} × ${l.qty}`).join(', ')}`);
  }
  if (state.lastRecommendation && state.lastRecommendation.length > 0) {
    lines.push(`Last power-station recommendation, eligible stations cheapest first: ${state.lastRecommendation.join(', ')}`);
  }
  if (dropped.length > 0) {
    lines.push(`These saved codes are no longer in the catalogue and were removed: ${dropped.join(', ')}. Tell the customer.`);
  }
  if (lines.length === 0) return null;
  return (
    'Session memory. It holds codes and quantities only. Use the codes as tool arguments. ' +
    'Prices still come only from tool results in this turn.\n- ' +
    lines.join('\n- ')
  );
}
