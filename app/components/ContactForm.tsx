'use client';
/**
 * Shown under an escalateToSales result. Posts straight to
 * /api/tickets/<id>/contact, so the client's details never reach the model.
 */
import { useState } from 'react';

export function ContactForm({ ticketId }: { ticketId: string }) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  if (state === 'sent') {
    return (
      <div className="mt-2 w-full rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        Thank you. CTI sales has your details on ticket <span className="font-mono">{ticketId}</span> and will contact you.
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
    <form onSubmit={submit} className="mt-2 w-full space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
      <div className="font-medium text-slate-800">
        Leave your details for CTI sales <span className="font-mono text-xs text-slate-500">({ticketId})</span>
      </div>
      <label className="block">
        <span className="text-xs text-slate-600">Name</span>
        <input
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1"
        />
      </label>
      <label className="block">
        <span className="text-xs text-slate-600">Mobile number or email</span>
        <input
          required
          maxLength={120}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1"
        />
      </label>
      <label className="flex items-start gap-2 text-xs text-slate-700">
        <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
        <span>
          I agree that CTI may store my name and contact details to answer this request, under the Data Privacy Act of 2012
          (Republic Act No. 10173). CTI uses them for this request only.
        </span>
      </label>
      {error && <div className="text-xs text-rose-700" role="alert">{error}</div>}
      <button
        type="submit"
        disabled={state === 'sending' || !consent}
        className="rounded-md bg-cyan-600 px-3 py-1 text-white disabled:opacity-50"
      >
        {state === 'sending' ? 'Sending…' : 'Send to CTI sales'}
      </button>
    </form>
  );
}
