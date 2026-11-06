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
 * M8 adds the rate limit in front of step 1 (lib/ratelimit.ts, HTTP 429), and
 * the response caches between steps 2 and 3 (lib/cache.ts). A hit replays the
 * stored reply through the same answer-guard checks. A miss writes the
 * reply after the turn. The `x-cache` header and the log line say which.
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
import { createAnswerGuard, reviewAnswer } from '@/lib/guardrails/answer-guard';
import { logRequest, sessionHash, type RequestLog } from '@/lib/log';
import { checkRateLimit, clientIp } from '@/lib/ratelimit';
import {
  deleteExact,
  embedQuery,
  exactKey,
  getExact,
  getSemantic,
  isCacheable,
  isPolicyAnswer,
  isStorable,
  replayResponse,
  setExact,
  setSemantic,
  type CachedReply,
} from '@/lib/cache';
import { SESSION_COOKIE } from '@/middleware';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tracer = trace.getTracer('cti-chat');

export async function POST(req: NextRequest) {
  const t0 = Date.now();

  // 0. Rate limit (PRD §13), before any other work.
  const limit = await checkRateLimit(clientIp(req.headers));
  if (limit.error) console.error(`rate limit check failed open: ${limit.error}`);
  if (!limit.ok) {
    logRequest({
      requestId: crypto.randomUUID(),
      sessionHash: 'none',
      traceId: '',
      latencyMs: Date.now() - t0,
      tokensIn: 0,
      tokensOut: 0,
      tools: [],
      cache: 'skip',
      guardrails: ['rate_limit'],
      action: 'block',
      error: null,
    });
    return new Response('Too many requests. Please wait a minute and try again.', {
      status: 429,
      headers: { 'Retry-After': String(limit.retryAfterS), 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  // The cache bench turns the caches off per request. Only when the server opts in.
  const bench = process.env.ALLOW_BENCH_HEADERS === '1' && req.headers.get('x-bench-no-cache') === '1';
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
      cache: 'skip' as RequestLog['cache'], // set to 'miss' or 'hit' below. The log reads it when finish() runs.
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
      // 3. Caches (M8). Only a first-turn question without PII, stock or quote intent.
      const turnIndex = messages.filter((m) => m.role === 'user').length - 1;
      let store: CacheStore | null = null;
      if (!bench && isCacheable(userText, turnIndex)) {
        base.cache = 'miss';
        const looked = await lookupCache(userText, { span, guardrails });
        if (looked.reply) {
          base.cache = 'hit';
          span.setAttribute('cti.cache', looked.layer);
          finish({
            tokensIn: 0,
            tokensOut: 0,
            tools: looked.reply.toolCalls.map((c) => c.toolName),
            guardrails,
            action: 'allow',
            error: null,
          });
          return replayResponse(looked.reply, { 'x-cache': 'hit' });
        }
        store = { key: looked.key, embedding: looked.embedding };
      }
      span.setAttribute('cti.cache', base.cache);
      return await answer({ messages, sessionId, userText, span, guardrails, finish, store, cacheHeader: base.cache });
    } catch (e) {
      finish({ tokensIn: 0, tokensOut: 0, tools: [], guardrails, action: 'allow', error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  });
}

type Finish = (f: Omit<RequestLog, 'requestId' | 'sessionHash' | 'traceId' | 'cache' | 'latencyMs'>) => void;

/** What a cache miss keeps, to write the reply after the turn: the exact key and the question embedding. */
type CacheStore = { key: string; embedding: number[] | null };

/**
 * Look for a stored reply: the exact cache first, then the semantic policy
 * cache. A hit goes through the same answer-guard checks as a fresh reply. If
 * the check changes the text, the exact entry is deleted and the checked text
 * is served.
 */
async function lookupCache(
  question: string,
  c: { span: Span; guardrails: string[] },
): Promise<{ reply: CachedReply | null; layer: 'exact' | 'semantic' | 'none'; key: string; embedding: number[] | null }> {
  const key = exactKey(question);
  let reply = await getExact(key);
  let layer: 'exact' | 'semantic' | 'none' = reply ? 'exact' : 'none';
  let embedding: number[] | null = null;
  if (!reply) {
    try {
      embedding = await embedQuery(question);
      const s = await getSemantic(embedding);
      if (s) {
        reply = { text: s.text, toolCalls: [], toolResults: [] };
        layer = 'semantic';
      }
    } catch (e) {
      console.error(`semantic lookup failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!reply) return { reply: null, layer, key, embedding };

  const checked = await reviewAnswer(reply.text, [...reply.toolResults], {
    userText: question,
    otel: context.active(),
    report: (event, detail) => {
      c.guardrails.push(`cache:${event}`);
      c.span.addEvent(`cache:${event}`, { detail: detail.join(', ') });
    },
  });
  if (checked.text !== reply.text) {
    if (layer === 'exact') await deleteExact(key);
    reply = { ...reply, text: checked.text };
  }
  return { reply, layer, key, embedding };
}

async function answer(a: {
  messages: Message[];
  sessionId: string | null;
  userText: string;
  span: Span;
  guardrails: string[];
  finish: Finish;
  store: CacheStore | null;
  cacheHeader: string;
}) {
  const { messages, sessionId, userText, span, guardrails, finish, store, cacheHeader } = a;
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
    onFinish: async ({ usage, steps }) => {
      finish({
        tokensIn: usage.promptTokens,
        tokensOut: usage.completionTokens,
        tools: steps.flatMap((s) => s.toolCalls.map((c) => c.toolName)),
        guardrails,
        action: 'allow',
        error: null,
      });
      // Write the reply to the caches. Not when session memory shaped the answer.
      if (store && memory === null) {
        const calls = steps.flatMap((s) => s.toolCalls).map((c) => ({ toolCallId: c.toolCallId, toolName: c.toolName, args: c.args }));
        const done = steps.flatMap((s) => s.toolResults);
        const reply: CachedReply = {
          text: steps.map((s) => s.text).join(''),
          toolCalls: calls,
          toolResults: calls.map((c) => done.find((r) => r.toolCallId === c.toolCallId)?.result),
        };
        if (isStorable(reply, guardrails)) {
          await setExact(store.key, reply);
          if (isPolicyAnswer(reply) && store.embedding) await setSemantic(userText, store.embedding, reply.text);
        }
      }
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

  return result.toDataStreamResponse({ headers: { 'x-cache': cacheHeader } });
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
    lines.push(`Last power-station recommendation, stations in the order shown: ${state.lastRecommendation.join(', ')}`);
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
