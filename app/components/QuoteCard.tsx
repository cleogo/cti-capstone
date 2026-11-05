'use client';
/**
 * The buildQuotation result as a card (docs/ui-design-decisions.md D6). Every figure comes
 * from the tool result (lib/quote.ts). Nothing here reads model text.
 *
 * Print: the button marks this card as the print target, then calls window.print(). The
 * print CSS in globals.css hides everything else. Photos do not print.
 */
import { useRef } from 'react';
import type { QuoteResult } from '@/lib/quote';
import { photoFor } from '@/lib/photos';
import { formatPeso } from './SourceCard';
import { card, eyebrow, IconAlert, IconPrinter, Logo, Photo, stagger } from './ui';

const REASON_TEXT: Record<string, string> = {
  unknown_code: 'not in the CTI masterlist',
  conflict_code: 'the masterlist holds conflicting prices, so CTI sales must confirm it',
  bad_qty: 'the quantity must be a whole number from 1 to 9,999',
  too_many_lines: 'a draft quotation holds 30 lines at most',
};

export function QuoteCard({ result }: { result: QuoteResult | { error: string; message?: string } }) {
  const ref = useRef<HTMLDivElement>(null);

  if ('error' in result) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <IconAlert className="h-4 w-4" /> Could not build the quotation: {result.message ?? result.error}
      </div>
    );
  }
  if (!result.ok) {
    return (
      <div className="mt-3 w-full rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <div className="mb-1 font-medium">No quotation was made.</div>
        <ul className="list-disc pl-5">
          {result.errors.map((e, i) => (
            <li key={i}>
              {e.code ? <span className="font-mono">{e.code}</span> : 'The list'}: {REASON_TEXT[e.reason] ?? e.reason}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const { quote } = result;
  const print = () => {
    const el = ref.current;
    if (!el) return;
    el.classList.add('print-target');
    window.addEventListener('afterprint', () => el.classList.remove('print-target'), { once: true });
    window.print();
  };

  return (
    <div ref={ref} className={`mt-3 w-full animate-card-in overflow-hidden ${card}`}>
      <div className="flex items-start justify-between gap-3 bg-ink px-4 py-3 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <Logo size={36} />
          <div className="min-w-0">
            <div className={`text-brand ${eyebrow}`}>Draft quotation</div>
            <div className="truncate font-mono text-sm">{quote.ref}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={print}
          className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs font-medium transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand print:hidden"
        >
          <IconPrinter className="h-4 w-4" /> Print
        </button>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-line px-4 py-2 text-xs text-muted">
        <span>Date {quote.date}</span>
        <span>Valid until {quote.valid_until}</span>
      </div>
      <ul className="divide-y divide-line">
        {quote.lines.map((l, i) => (
          <li key={l.code} className="flex animate-card-in items-center gap-3 px-4 py-2.5" style={stagger(i)}>
            <div className="print:hidden">
              <Photo src={photoFor(l.code)} alt={l.name} size={40} className="w-10 rounded-lg" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm leading-snug text-ink">{l.name}</div>
              <div className="font-mono text-[11px] text-faint">
                {l.code} · {l.qty.toLocaleString('en-PH')} × {formatPeso(l.unit_price_php)}
              </div>
            </div>
            <div className="shrink-0 font-heading text-sm font-semibold tabular-nums text-ink">{formatPeso(l.line_total_php)}</div>
          </li>
        ))}
      </ul>
      <dl className="space-y-1 border-t border-line bg-paper/60 px-4 py-3 text-sm">
        <div className="flex justify-between text-muted">
          <dt>VATable sales</dt>
          <dd className="tabular-nums">{formatPeso(quote.vatable_sales_php)}</dd>
        </div>
        <div className="flex justify-between text-muted">
          <dt>VAT (12%)</dt>
          <dd className="tabular-nums">{formatPeso(quote.vat_php)}</dd>
        </div>
        <div className="flex justify-between gap-3 pt-1 font-heading text-base font-bold text-ink sm:text-lg">
          <dt>Total (VAT-inclusive)</dt>
          <dd className="tabular-nums">{formatPeso(quote.total_php)}</dd>
        </div>
      </dl>
      <p className="border-t border-line px-4 py-2.5 text-xs text-link">{quote.note}</p>
    </div>
  );
}
