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
 */
import { openai } from '@ai-sdk/openai';
import { generateText, streamText, type Message } from 'ai';
import type { NextRequest } from 'next/server';
import { SYSTEM_PROMPT } from '@/lib/prompt';
import { createTools } from '@/lib/tools';
import { CHAT_MODEL, CHAT_MODEL_SETTINGS, MAX_STEPS } from '@/lib/model';
import { telemetry } from '@/lib/telemetry';
import { getSession, saveSession, trimHistory, stripPrices, emptySession, type SessionState } from '@/lib/session';
import { SESSION_COOKIE } from '@/middleware';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const { messages } = (await req.json()) as { messages: Message[] };

  const raw = req.cookies.get(SESSION_COOKIE)?.value;
  const sessionId = raw && UUID.test(raw) ? raw : null;

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

  const result = streamText({
    model: openai(CHAT_MODEL, CHAT_MODEL_SETTINGS),
    system: SYSTEM_PROMPT,
    messages: memory ? [{ role: 'system', content: memory } as Message, ...kept] : kept,
    tools: createTools({ sessionId }),
    // A turn may search, then filter, then answer. The power-station flow
    // needs more: one lookup per appliance, then recommendPowerStation, then text.
    maxSteps: MAX_STEPS,
    experimental_telemetry: telemetry('chat', { sessionId: sessionId ?? 'none' }),
  });

  return result.toDataStreamResponse();
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
