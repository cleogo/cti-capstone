'use client';
/**
 * The buildQuotation result as a card. Every figure comes from the tool result
 * (lib/quote.ts). Nothing here reads model text.
 *
 * Print: the button marks this card as the print target, then calls
 * window.print(). The print CSS in globals.css hides everything else.
 */
import { useRef } from 'react';
import type { QuoteResult } from '@/lib/quote';
import { formatPeso } from './SourceCard';

const REASON_TEXT: Record<string, string> = {
  unknown_code: 'not in the CTI masterlist',
  conflict_code: 'the masterlist holds conflicting prices, so CTI sales must confirm it',
  bad_qty: 'the quantity must be a whole number from 1 to 9,999',
  too_many_lines: 'a draft quotation holds 30 lines at most',
};

export function QuoteCard({ result }: { result: QuoteResult | { error: string; message?: string } }) {
  const ref = useRef<HTMLDivElement>(null);

  if ('error' in result) {
    return <div className="mt-2 text-sm text-rose-700">Could not build the quotation: {result.message ?? result.error}</div>;
  }
  if (!result.ok) {
    return (
      <div className="mt-2 w-full rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
        <div className="mb-1 font-medium">No quotation was made.</div>
        <ul>
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
    <div ref={ref} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-amber-700">Draft quotation</div>
          <div className="font-mono text-slate-900">{quote.ref}</div>
          <div className="text-xs text-slate-600">
            Date {quote.date} · Valid until {quote.valid_until}
          </div>
        </div>
        <button
          type="button"
          onClick={print}
          className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100 print:hidden"
        >
          Print
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-slate-700">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-1 pr-2 font-medium">Code</th>
              <th className="py-1 pr-2 font-medium">Item</th>
              <th className="py-1 pr-2 text-right font-medium">Qty</th>
              <th className="py-1 pr-2 text-right font-medium">Unit price</th>
              <th className="py-1 text-right font-medium">Line total</th>
            </tr>
          </thead>
          <tbody>
            {quote.lines.map((l) => (
              <tr key={l.code} className="border-b border-slate-100 align-top">
                <td className="py-1 pr-2 font-mono whitespace-nowrap">{l.code}</td>
                <td className="py-1 pr-2">{l.name}</td>
                <td className="py-1 pr-2 text-right">{l.qty.toLocaleString('en-PH')}</td>
                <td className="py-1 pr-2 text-right whitespace-nowrap">{formatPeso(l.unit_price_php)}</td>
                <td className="py-1 text-right whitespace-nowrap">{formatPeso(l.line_total_php)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="pt-2 pr-2 text-right font-semibold text-slate-900">
                Total (VAT-inclusive)
              </td>
              <td className="pt-2 text-right font-semibold whitespace-nowrap text-slate-900">{formatPeso(quote.total_php)}</td>
            </tr>
            <tr>
              <td colSpan={4} className="pr-2 text-right">VATable sales</td>
              <td className="text-right whitespace-nowrap">{formatPeso(quote.vatable_sales_php)}</td>
            </tr>
            <tr>
              <td colSpan={4} className="pr-2 text-right">VAT (12%)</td>
              <td className="text-right whitespace-nowrap">{formatPeso(quote.vat_php)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-3 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900">{quote.note}</p>
    </div>
  );
}
