/**
 * Runs against the real capstone Redis, under a test key prefix, so the
 * staff ticket list never sees these rows. Run: npm run test:redis
 * (it loads .env.local through --env-file, before any import runs).
 * lib/tickets reads the prefix at call time, so setting it here is in time.
 */
process.env.TICKET_KEY_PREFIX = 'test:';

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTicket, getTicket, attachContact, listTickets, ticketKey, ticketListKey } from '../lib/tickets';
import { getRedis } from '../lib/redis';

const made: string[] = [];

after(async () => {
  for (const id of made) await getRedis().del(ticketKey(id));
  for (const id of made) await getRedis().lrem(ticketListKey(), 0, id);
});

test('keys use the test prefix', () => {
  assert.equal(ticketKey('X'), 'test:ticket:X');
  assert.equal(ticketListKey(), 'test:tickets');
});

test('create a ticket and read it back', async () => {
  const { id } = await createTicket({ reason: 'commercial_terms', summary: 'Asked for a discount on PWR-001-06.', sessionId: null });
  made.push(id);
  const t = await getTicket(id);
  assert.ok(t);
  assert.equal(t.reason, 'commercial_terms');
  assert.equal(t.summary, 'Asked for a discount on PWR-001-06.');
  assert.equal(t.status, 'open');
  assert.equal(t.contact, null);
  const listed = await listTickets(10);
  assert.equal(listed[0].id, id, 'newest ticket first');
});

test('attach contact details with consent', async () => {
  const { id } = await createTicket({ reason: 'asked_for_person', summary: 'Wants to talk to sales.', sessionId: 'sess-1' });
  made.push(id);
  await attachContact(id, { name: 'Juan Dela Cruz', contact: '0917 000 0000', consent: true });
  const t = await getTicket(id);
  assert.equal(t?.contact_name, 'Juan Dela Cruz');
  assert.equal(t?.contact, '0917 000 0000');
  assert.ok(t?.consent_at);
  assert.equal(t?.session_id, 'sess-1');
});

test('a mobile number keeps its leading zero', async () => {
  const { id } = await createTicket({ reason: 'asked_for_person', summary: '12345', sessionId: null });
  made.push(id);
  await attachContact(id, { name: 'Ana', contact: '09171234567', consent: true });
  const t = await getTicket(id);
  assert.equal(t?.contact, '09171234567');
  assert.equal(t?.summary, '12345');
});

test('attachContact without consent: true throws', async () => {
  const { id } = await createTicket({ reason: 'bulk_order', summary: 'Wants 200 units.', sessionId: null });
  made.push(id);
  await assert.rejects(
    // @ts-expect-error: consent must be the literal true
    attachContact(id, { name: 'A', contact: 'a@example.com', consent: false }),
    /consent/,
  );
  assert.equal((await getTicket(id))?.contact, null);
});

test('attachContact on an unknown ticket throws', async () => {
  await assert.rejects(attachContact('TK-NOPE0000', { name: 'A', contact: 'a@example.com', consent: true }), /not found/);
});
