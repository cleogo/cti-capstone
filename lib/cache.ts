/**
 * Caches (PRD §12). Four layers:
 *
 *   exact response    Redis, 24 h. Key = hash(question, prompt, catalogue, model).
 *                     Holds the whole reply: text plus tool calls and results,
 *                     so a hit still feeds the sources panel from tool metadata.
 *   semantic response Upstash Vector, namespace "semantic-cache", 24 h,
 *                     similarity >= 0.95. Policy answers only (isPolicyAnswer).
 *                     Filtered on versionTag(), the same parts as the exact key.
 *   query embedding   Redis, 7 days (embedQuery).
 *   document chunks   lib/seed.ts skips a chunk whose hash is unchanged.
 *
 * Every replay goes through the answer guard in the route, so a cached reply is
 * checked like a fresh one. This file holds no price logic: a price on screen
 * still comes from the stored tool results.
 */
import { createHash } from 'node:crypto';
import { Index } from '@upstash/vector';
import { embed, createDataStreamResponse, formatDataStreamPart } from 'ai';
import { openai } from '@ai-sdk/openai';
import { CODE_PATTERN } from './products';
import { PROMPT_VERSION } from './prompt';
import { CHAT_MODEL } from './model';
import { CATALOG_VERSION } from './version';
import { getRedis } from './redis';

export const RESPONSE_TTL_S = 24 * 60 * 60;
export const EMBEDDING_TTL_S = 7 * 24 * 60 * 60;
export const SEMANTIC_THRESHOLD = 0.95;
const SEMANTIC_NAMESPACE = 'semantic-cache';
const EMBEDDING_MODEL = 'text-embedding-3-small';

export type CachedReply = {
  text: string;
  toolCalls: { toolCallId: string; toolName: string; args: unknown }[];
  toolResults: unknown[];
};

export type KeyParts = { prompt: string; catalog: string; model: string };

const hash = (s: string) => createHash('sha256').update(s).digest('hex');

/** Lower case, single spaces, no end punctuation. */
export function normalizeQuestion(q: string): string {
  return q.toLowerCase().replace(/\s+/g, ' ').replace(/[\s.?!]+$/g, '').trim();
}

const CURRENT_PARTS: KeyParts = { prompt: PROMPT_VERSION, catalog: CATALOG_VERSION, model: CHAT_MODEL };

export function exactKey(q: string, parts: KeyParts = CURRENT_PARTS): string {
  return `resp:${hash([normalizeQuestion(q), parts.prompt, parts.catalog, parts.model].join('\u0000'))}`;
}

/** The same three parts as the exact key. A semantic entry matches only when its tag is equal. */
export function versionTag(parts: KeyParts = CURRENT_PARTS): string {
  return `${parts.prompt}|${parts.catalog}|${parts.model}`;
}

const PII_MASK = /\[(?:PHONE|EMAIL|TIN|CARD)\]/;
// A question that depends on stock, a quote or the session ("my saved list") is not a stable question.
const UNSTABLE = /\b(?:stock|inventory|availab\w*|quot\w*|my (?:list|quote|order|cart)|saved|earlier|previous)\b/i;

/**
 * True only for the first turn, with no PII mask, and no stock, quote or
 * session intent. `q` is the masked question, so a mask token marks PII.
 */
export function isCacheable(q: string, turnIndex: number): boolean {
  return turnIndex === 0 && !PII_MASK.test(q) && !UNSTABLE.test(q);
}

// ponytail: the watt pattern is case sensitive on purpose ("W", "kW", "Wh", "kWh"). A lower-case "5 w" is not caught.
const WATT = /\d[\d,.]*\s*k?Wh?\b/;
const PESO = /₱|\bPHP\b|\bpesos?\b/i;

/** True when the turn called no tool and the text has no ₱ figure, product code or watt figure. */
export function isPolicyAnswer(r: CachedReply): boolean {
  if (r.toolCalls.length > 0) return false;
  return !PESO.test(r.text) && !new RegExp(CODE_PATTERN.source, 'i').test(r.text) && !WATT.test(r.text);
}

// A replay would skip the effect: a ticket, a saved quote list or a saved recommendation.
const SIDE_EFFECT_TOOLS = new Set(['escalateToSales', 'buildQuotation', 'recommendPowerStation', 'showApplianceChecklist']);

/** Whether a finished turn may be written to the exact cache. */
export function isStorable(r: CachedReply, guardrails: string[]): boolean {
  if (r.text.trim() === '') return false;
  if (r.toolCalls.some((c) => SIDE_EFFECT_TOOLS.has(c.toolName))) return false;
  // The stored text must be the text the client saw. A guard that rewrote it breaks that.
  if (guardrails.some((g) => g.startsWith('grounding:') || g.startsWith('moderation:'))) return false;
  if (JSON.stringify(r.toolResults).includes('"degraded":true')) return false;
  if (JSON.stringify(r.toolResults).includes('"error"')) return false;
  return true;
}

// ── Redis: exact cache ──────────────────────────────────────────────────

export async function getExact(key: string): Promise<CachedReply | null> {
  try {
    const v = await getRedis().get<CachedReply>(key);
    return v && typeof v.text === 'string' ? v : null;
  } catch (e) {
    console.error(`exact cache read failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export async function setExact(key: string, reply: CachedReply): Promise<void> {
  try {
    await getRedis().set(key, reply, { ex: RESPONSE_TTL_S });
  } catch (e) {
    console.error(`exact cache write failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function deleteExact(key: string): Promise<void> {
  try {
    await getRedis().del(key);
  } catch {
    // The entry expires in 24 h anyway.
  }
}

// ── Query embedding cache ───────────────────────────────────────────────

export async function embedQuery(q: string): Promise<number[]> {
  const key = `emb:${EMBEDDING_MODEL}:${hash(normalizeQuestion(q))}`;
  try {
    const hit = await getRedis().get<number[]>(key);
    if (Array.isArray(hit) && hit.length > 0) return hit;
  } catch {
    // Redis down or not configured: embed without the cache.
  }
  const { embedding } = await embed({ model: openai.embedding(EMBEDDING_MODEL), value: q });
  try {
    await getRedis().set(key, embedding, { ex: EMBEDDING_TTL_S });
  } catch {
    // Not cached. The next call embeds again.
  }
  return embedding;
}

// ── Vector namespace: semantic policy cache ─────────────────────────────

let _index: Index | null = null;
const semantic = () => (_index ??= new Index()).namespace(SEMANTIC_NAMESPACE);

/** The text of a cached policy answer whose question is >= 0.95 similar, or null. */
export async function getSemantic(embedding: number[]): Promise<{ text: string; score: number } | null> {
  try {
    // The filter keeps an entry from an old prompt, catalogue or model out of the result.
    const [top] = await semantic().query({ vector: embedding, topK: 1, includeMetadata: true, filter: `version = '${versionTag()}'` });
    if (!top || top.score < SEMANTIC_THRESHOLD) return null;
    const m = (top.metadata ?? {}) as { text?: unknown; expires_at?: unknown };
    // Vector has no TTL. The entry carries its own expiry.
    if (typeof m.text !== 'string' || typeof m.expires_at !== 'number' || m.expires_at < Date.now()) return null;
    return { text: m.text, score: top.score };
  } catch (e) {
    console.error(`semantic cache read failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export async function setSemantic(question: string, embedding: number[], text: string): Promise<void> {
  try {
    await semantic().upsert({
      id: `sem:${hash([normalizeQuestion(question), versionTag()].join('\u0000'))}`,
      vector: embedding,
      metadata: { text, version: versionTag(), expires_at: Date.now() + RESPONSE_TTL_S * 1000 },
    });
  } catch (e) {
    console.error(`semantic cache write failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ── Replay ──────────────────────────────────────────────────────────────

/** Send a stored reply in the AI SDK data-stream format: tool calls and results first, then the text. */
export function replayResponse(reply: CachedReply, headers: Record<string, string>): Response {
  const usage = { promptTokens: 0, completionTokens: 0 };
  return createDataStreamResponse({
    headers,
    execute: (ds) => {
      if (reply.toolCalls.length > 0) {
        ds.write(formatDataStreamPart('start_step', { messageId: crypto.randomUUID() }));
        for (const c of reply.toolCalls) {
          ds.write(formatDataStreamPart('tool_call', { toolCallId: c.toolCallId, toolName: c.toolName, args: c.args }));
        }
        reply.toolCalls.forEach((c, i) => {
          ds.write(formatDataStreamPart('tool_result', { toolCallId: c.toolCallId, result: reply.toolResults[i] }));
        });
        ds.write(formatDataStreamPart('finish_step', { finishReason: 'tool-calls', usage, isContinued: false }));
      }
      ds.write(formatDataStreamPart('start_step', { messageId: crypto.randomUUID() }));
      ds.write(formatDataStreamPart('text', reply.text));
      ds.write(formatDataStreamPart('finish_step', { finishReason: 'stop', usage, isContinued: false }));
      ds.write(formatDataStreamPart('finish_message', { finishReason: 'stop', usage }));
    },
  });
}
