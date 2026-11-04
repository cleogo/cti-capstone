'use client';

/**
 * The saved quote list, read from GET /api/session. It survives a page
 * reload. `refreshKey` changes when a new quotation arrives in the chat.
 */
import { useEffect, useState } from 'react';

type Line = { code: string; name: string; qty: number };

export function QuoteList({ refreshKey }: { refreshKey: number }) {
  const [quote, setQuote] = useState<Line[]>([]);
  const [dropped, setDropped] = useState<string[]>([]);

  useEffect(() => {
    let live = true;
    fetch('/api/session')
      .then((r) => (r.ok ? r.json() : { quote: [], dropped: [] }))
      .then((body: { quote?: Line[]; dropped?: string[] }) => {
        if (!live) return;
        setQuote(body.quote ?? []);
        // Keep a dropped-codes note once shown: the server reports it only once.
        if (body.dropped?.length) setDropped(body.dropped);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [refreshKey]);

  if (quote.length === 0 && dropped.length === 0) return null;

  return (
    <section aria-label="Saved quote list" className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
      <h2 className="mb-1 font-semibold text-slate-800">Your saved quote list</h2>
      {quote.length > 0 && (
        <ul className="space-y-0.5 text-slate-700">
          {quote.map((l) => (
            <li key={l.code}>
              <span className="font-mono">{l.code}</span> {l.name} × {l.qty}
            </li>
          ))}
        </ul>
      )}
      {quote.length > 0 && (
        <p className="mt-1 text-xs text-slate-500">Ask for a quotation to see the prices, total and VAT.</p>
      )}
      {dropped.length > 0 && (
        <p className="mt-1 text-xs text-amber-700">
          Removed because they are no longer in the catalogue: {dropped.join(', ')}.
        </p>
      )}
    </section>
  );
}
