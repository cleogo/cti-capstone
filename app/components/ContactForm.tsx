'use client';
/**
 * Shown under an escalateToSales result. Posts straight to /api/tickets/<id>/contact, so the
 * client's details never reach the model. Design: docs/ui-design-decisions.md D6.
 */
import { useState } from 'react';
import { btnPrimary, card, field, IconCheck, IconHeadset } from './ui';

export function ContactForm({ ticketId }: { ticketId: string }) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  if (state === 'sent') {
    return (
      <div className="mt-3 flex w-full animate-card-in items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
          <IconCheck className="h-4 w-4" />
        </span>
        <div>
          <div className="font-medium">CTI sales has your details.</div>
          <div className="text-xs">
            Ticket <span className="font-mono">{ticketId}</span>. A sales person will contact you.
          </div>
        </div>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('sending');
    setError('');
    try {
      const res = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, contact, consent }),
      });
      if (res.ok) return setState('sent');
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? `The request failed (HTTP ${res.status}). Try again.`);
      setState('error');
    } catch {
      setError('The network request failed. Check your connection and try again.');
      setState('error');
    }
  };

  return (
    <form onSubmit={submit} className={`mt-3 w-full animate-card-in overflow-hidden ${card}`}>
      <div className="flex items-center gap-3 border-b border-line bg-paper/60 px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-brand">
          <IconHeadset className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-heading font-semibold text-ink">Leave your details for CTI sales</div>
          <div className="text-xs text-muted">
            Ticket <span className="font-mono">{ticketId}</span>
          </div>
        </div>
      </div>
      <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
        <label className="block text-xs text-muted">
          Name
          <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={`${field} mt-1`} />
        </label>
        <label className="block text-xs text-muted">
          Mobile number or email
          <input required maxLength={120} value={contact} onChange={(e) => setContact(e.target.value)} className={`${field} mt-1`} />
        </label>
        <label className="flex items-start gap-2 text-xs text-muted sm:col-span-2">
          <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-ink" />
          <span>
            I agree that CTI may store my name and contact details to answer this request, under the Data Privacy Act of 2012
            (Republic Act No. 10173). CTI uses them for this request only.
          </span>
        </label>
        {error && (
          <div className="text-xs text-red-700 sm:col-span-2" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="border-t border-line px-4 py-3">
        <button type="submit" disabled={state === 'sending' || !consent} className={`${btnPrimary} w-full sm:w-auto`}>
          {state === 'sending' ? 'Sending…' : 'Send to CTI sales'}
        </button>
      </div>
    </form>
  );
}
