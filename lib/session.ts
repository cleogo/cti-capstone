/**
 * Session memory (PRD §7.3), stored in Upstash Redis.
 *
 *   <prefix>session:<id>   JSON value, TTL 7 days
 *
 * The id is the cti_sid cookie (middleware.ts). The state holds no personal
 * data: product codes, quantities, loads and a summary of trimmed turns.
 * SESSION_KEY_PREFIX is empty in production. The Redis tests set "test:".
 */
import type { Message } from 'ai';
import { getRedis } from '@/lib/redis';
import { BY_CODE } from '@/lib/products';
import type { Load } from '@/lib/power';

export type SessionState = {
  quote: { code: string; qty: number }[];
  appliances: Load[];
  lastRecommendation: string[] | null;
  summary: string | null;
  /** How many of the oldest messages `summary` already covers. */
  summarized: number;
};

export const SESSION_TTL_S = 7 * 24 * 60 * 60;
export const HISTORY_KEEP = 12;

export const emptySession = (): SessionState => ({
  quote: [],
  appliances: [],
  lastRecommendation: null,
  summary: null,
  summarized: 0,
});

const prefix = () => process.env.SESSION_KEY_PREFIX ?? '';
export const sessionKey = (id: string) => `${prefix()}session:${id}`;

/**
 * Read a session. A code that a corpus rebuild removed is dropped from the
 * quote list and the last recommendation, and `dropped` names it so the
 * client can be told. The cleaned state is saved back.
 */
export async function getSession(id: string): Promise<{ state: SessionState; dropped: string[] }> {
  const raw = await getRedis().get<Partial<SessionState>>(sessionKey(id));
  const state = { ...emptySession(), ...(raw ?? {}) };
  const dropped = new Set<string>();

  state.quote = state.quote.filter((l) => {
    if (BY_CODE.has(l.code)) return true;
    dropped.add(l.code);
    return false;
  });
  if (state.lastRecommendation) {
    state.lastRecommendation = state.lastRecommendation.filter((c) => {
      if (BY_CODE.has(c)) return true;
      dropped.add(c);
      return false;
    });
  }

  if (dropped.size > 0) await saveSession(id, state);
  return { state, dropped: [...dropped] };
}

export async function saveSession(id: string, s: SessionState): Promise<void> {
  await getRedis().set(sessionKey(id), s, { ex: SESSION_TTL_S });
}

/** Read, change and save one session. */
export async function updateSession(id: string, change: (s: SessionState) => void): Promise<SessionState> {
  const { state } = await getSession(id);
  change(state);
  await saveSession(id, state);
  return state;
}

/**
 * Drop every sentence of a summary that holds a price. The summary model
 * invented "The FIR-001-10LBS is ₱45,999.00." in M5, and a price must never
 * come from model text. Code enforces it, not the summary prompt.
 */
export function stripPrices(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => !/₱|\bPHP\b|\bpesos?\b|\bVAT\b/i.test(s))
    .join(' ')
    .trim();
}

/** Keep the last `keep` messages. A UI message holds its own tool calls, so no pair is split. */
export function trimHistory<M extends Pick<Message, 'role'>>(
  messages: M[],
  keep = HISTORY_KEEP,
): { kept: M[]; dropped: M[] } {
  if (messages.length <= keep) return { kept: messages, dropped: [] };
  const cut = messages.length - keep;
  return { kept: messages.slice(cut), dropped: messages.slice(0, cut) };
}
