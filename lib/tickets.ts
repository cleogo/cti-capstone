/**
 * Escalation tickets (PRD F9), stored in Upstash Redis.
 *
 *   <prefix>ticket:<id>   hash, one ticket
 *   <prefix>tickets       list of ids, newest first
 *
 * TICKET_KEY_PREFIX is empty in production. The Redis tests set "test:" so
 * their rows never reach the staff list.
 *
 * Contact details reach a ticket only through attachContact, which the
 * contact route calls from the form. They never pass through the model.
 */
import { randomBytes } from 'node:crypto';
import { getRedis } from '@/lib/redis';

export const TICKET_REASONS = [
  'conflict_code',
  'missing_specs',
  'life_critical',
  'commercial_terms',
  'bulk_order',
  'failed_search',
  'asked_for_person',
] as const;
export type TicketReason = (typeof TICKET_REASONS)[number];

export type Ticket = {
  id: string;
  reason: TicketReason;
  summary: string;
  session_id: string | null;
  status: 'open';
  created_at: string;
  contact_name: string | null;
  contact: string | null;
  consent_at: string | null;
};

/**
 * Every hash field is stored JSON-encoded. The client JSON-parses values on
 * read, so a raw "09171234567" would come back as a number without its
 * leading zero. An encoded string always comes back as the same string.
 */
const enc = (fields: Record<string, string>) =>
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, JSON.stringify(v)]));

const prefix = () => process.env.TICKET_KEY_PREFIX ?? '';
export const ticketKey = (id: string) => `${prefix()}ticket:${id}`;
export const ticketListKey = () => `${prefix()}tickets`;

export const MAX_SUMMARY = 1000;
export const MAX_CONTACT_FIELD = 120;

export async function createTicket(t: { reason: TicketReason; summary: string; sessionId: string | null }): Promise<{ id: string }> {
  if (!TICKET_REASONS.includes(t.reason)) throw new Error(`unknown ticket reason: ${t.reason}`);
  const id = `TK-${randomBytes(4).toString('hex').toUpperCase()}`;
  await getRedis().hset(ticketKey(id), enc({
    id,
    reason: t.reason,
    summary: t.summary.slice(0, MAX_SUMMARY),
    session_id: t.sessionId ?? '',
    status: 'open',
    created_at: new Date().toISOString(),
    contact_name: '',
    contact: '',
    consent_at: '',
  }));
  await getRedis().lpush(ticketListKey(), id);
  return { id };
}

export async function getTicket(id: string): Promise<Ticket | null> {
  const h = await getRedis().hgetall<Record<string, string>>(ticketKey(id));
  if (!h || !h.id) return null;
  const orNull = (v: unknown) => (v === '' || v === undefined || v === null ? null : String(v));
  return {
    id: String(h.id),
    reason: h.reason as TicketReason,
    summary: String(h.summary ?? ''),
    session_id: orNull(h.session_id),
    status: 'open',
    created_at: String(h.created_at),
    contact_name: orNull(h.contact_name),
    contact: orNull(h.contact),
    consent_at: orNull(h.consent_at),
  };
}

export async function listTickets(limit = 50): Promise<Ticket[]> {
  const ids = await getRedis().lrange<string>(ticketListKey(), 0, limit - 1);
  const tickets = await Promise.all(ids.map((id) => getTicket(String(id))));
  return tickets.filter((t): t is Ticket => t !== null);
}

export async function attachContact(id: string, c: { name: string; contact: string; consent: true }): Promise<void> {
  if (c.consent !== true) throw new Error('consent is required before contact details are stored');
  const name = c.name.trim();
  const contact = c.contact.trim();
  if (!name || !contact) throw new Error('name and contact are required');
  if (name.length > MAX_CONTACT_FIELD || contact.length > MAX_CONTACT_FIELD) throw new Error('name or contact is too long');
  const exists = await getRedis().exists(ticketKey(id));
  if (!exists) throw new Error(`ticket ${id} not found`);
  await getRedis().hset(ticketKey(id), enc({ contact_name: name, contact, consent_at: new Date().toISOString() }));
}
