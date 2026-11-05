'use client';

/**
 * The saved quote list, read from GET /api/session. It survives a page reload. `refreshKey`
 * changes when a new quotation arrives in the chat.
 *
 * Design (docs/ui-design-decisions.md D6): a gold "Quote list (n)" button in the top bar
 * that opens a popover. The button is hidden while the list is empty.
 */
import { useEffect, useRef, useState } from 'react';
import { photoFor } from '@/lib/photos';
import { IconList, Photo } from './ui';

type Line = { code: string; name: string; qty: number };

export function QuoteList({ refreshKey }: { refreshKey: number }) {
  const [quote, setQuote] = useState<Line[]>([]);
  const [dropped, setDropped] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

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

  // Close on Escape or on a click outside the popover.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  if (quote.length === 0 && dropped.length === 0) return null;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="quote-list"
        className="flex min-h-[40px] animate-card-in items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-medium text-ink transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white active:scale-[0.97]"
      >
        <IconList className="h-4 w-4" />
        <span className="hidden sm:inline">Quote list</span>
        <span className="tabular-nums">({quote.length})</span>
      </button>
      {open && (
        <section
          id="quote-list"
          aria-label="Saved quote list"
          className="fixed inset-x-3 top-16 z-20 animate-msg-in rounded-2xl border border-line bg-white p-4 text-ink shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-80"
        >
          <h2 className="mb-2 font-heading text-sm font-semibold">Your saved quote list</h2>
          {quote.length > 0 && (
            <ul className="max-h-72 space-y-1.5 overflow-y-auto text-xs">
              {quote.map((l) => (
                <li key={l.code} className="flex items-center gap-2">
                  <Photo src={photoFor(l.code)} alt={l.name} size={32} className="w-8 rounded-md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{l.name}</span>
                    <span className="font-mono text-faint">{l.code}</span>
                  </span>
                  <span className="shrink-0 font-mono text-muted">× {l.qty}</span>
                </li>
              ))}
            </ul>
          )}
          {quote.length > 0 && <p className="mt-2 text-[11px] text-muted">Ask for a quotation to see the prices, total and VAT.</p>}
          {dropped.length > 0 && (
            <p className="mt-2 text-[11px] text-link">Removed because they are no longer in the catalogue: {dropped.join(', ')}.</p>
          )}
        </section>
      )}
    </div>
  );
}
