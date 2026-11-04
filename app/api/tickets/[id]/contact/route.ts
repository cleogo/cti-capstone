/**
 * POST /api/tickets/<id>/contact — the ContactForm posts here.
 *
 * The client's name and contact go from the form to Redis directly. They
 * never pass through the model or the chat route, so they never reach a
 * Langfuse trace.
 *
 * Optional sales alert: when RESEND_API_KEY and SALES_ALERT_EMAIL are both
 * set, send one plain email with the ticket id and reason only. No client
 * details go in the email. A failed email never fails the request.
 */
import { z } from 'zod';
import { attachContact, getTicket, MAX_CONTACT_FIELD } from '@/lib/tickets';

const Body = z.object({
  name: z.string().trim().min(1).max(MAX_CONTACT_FIELD),
  contact: z.string().trim().min(3).max(MAX_CONTACT_FIELD),
  consent: z.literal(true),
});

async function alertSales(id: string, reason: string): Promise<string> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.SALES_ALERT_EMAIL;
  if (!key || !to) return 'skipped';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.SALES_ALERT_FROM ?? 'CTI Advisor <onboarding@resend.dev>',
        to: [to],
        subject: `New CTI advisor ticket ${id} (${reason})`,
        text: `A client left contact details on ticket ${id}.\nReason: ${reason}\nRun "npx tsx scripts/tickets.ts" to read it.`,
      }),
    });
    return res.ok ? 'sent' : `failed_${res.status}`;
  } catch {
    return 'failed';
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^TK-[0-9A-F]{8}$/.test(id)) return Response.json({ error: 'Unknown ticket.' }, { status: 404 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: 'Enter your name and a phone number or email, and tick the consent box.' },
      { status: 400 },
    );
  }

  const ticket = await getTicket(id);
  if (!ticket) return Response.json({ error: 'Unknown ticket.' }, { status: 404 });

  await attachContact(id, parsed.data);
  const email = await alertSales(id, ticket.reason);
  // One log line, no client details.
  console.log(JSON.stringify({ event: 'ticket_contact', ticket: id, reason: ticket.reason, email }));

  return Response.json({ ok: true });
}
