/**
 * The request log (PRD §13): one JSON line per chat request, on stdout.
 * Vercel keeps stdout as the function log.
 *
 * The line holds no message text and no session id. The session id is
 * hashed, so two lines from one session can be matched without storing the
 * cookie value.
 */
import { createHash } from 'node:crypto';

export type RequestLog = {
  requestId: string;
  sessionHash: string;
  traceId: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  tools: string[];
  cache: 'hit' | 'miss' | 'skip';
  /** Every guard that fired: "injection", "pii:PHONE", "grounding:regenerated" and so on. */
  guardrails: string[];
  action: 'allow' | 'block' | 'redirect';
  error: string | null;
};

export function sessionHash(sessionId: string | null): string {
  return sessionId ? createHash('sha256').update(sessionId).digest('hex').slice(0, 12) : 'none';
}

export function logRequest(fields: RequestLog): void {
  console.log(JSON.stringify({ event: 'chat', ...fields }));
}
