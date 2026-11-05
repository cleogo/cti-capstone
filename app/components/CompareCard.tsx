'use client';
/**
 * The compareProducts result as a table (docs/ui-design-decisions.md D6). Prices come from
 * the masterlist through lib/details.ts. Specs come from knowledge sheets only. A null value
 * is "Not on file", never a gap for the model to fill. A conflict code has a null price.
 */
import type { CompareResult } from '@/lib/details';
import { photoFor } from '@/lib/photos';
import { formatPeso } from './SourceCard';
import { card, eyebrow, IconAlert, Photo } from './ui';

const NOT_ON_FILE = <span className="text-faint">Not on file</span>;

export function CompareCard({ result }: { result: CompareResult | { error: string; message?: string } }) {
  if ('error' in result) return null; // The answer text explains the failure. Sources show nothing either.
  const { products, rows } = result;
  const th = `sticky left-0 z-[1] bg-white px-3 py-2 text-left align-top text-muted ${eyebrow}`;

  return (
    <div className={`-mx-4 mt-3 animate-card-in overflow-x-auto sm:mx-0 ${card} rounded-none border-x-0 sm:rounded-2xl sm:border-x`}>
      <table className="w-full min-w-[480px] text-sm">
        <caption className="sr-only">Comparison of {products.map((p) => p.code).join(', ')}</caption>
        <thead>
          <tr>
            <th className="sticky left-0 z-[1] w-24 bg-white" />
            {products.map((p) => (
              <th key={p.code} scope="col" className="min-w-[140px] p-3 text-left align-top font-normal">
                <Photo src={photoFor(p.code, p.data_quality_flag)} alt={p.name} size={96} className="mb-2 w-20 rounded-xl sm:w-24" />
                <div className="font-medium leading-snug text-ink">{p.name}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-line">
            <th scope="row" className={th}>Code</th>
            {products.map((p) => (
              <td key={p.code} className="px-3 py-2 font-mono text-xs text-ink">{p.code}</td>
            ))}
          </tr>
          <tr className="border-t border-line">
            <th scope="row" className={th}>Price</th>
            {products.map((p) => (
              <td key={p.code} className="px-3 py-2">
                {p.price_php === null ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
                    <IconAlert className="h-3.5 w-3.5" /> Price conflict
                  </span>
                ) : (
                  <span className="font-heading font-semibold tabular-nums text-ink">{formatPeso(p.price_php)}</span>
                )}
              </td>
            ))}
          </tr>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-line">
              <th scope="row" className={th}>{r.label}</th>
              {r.values.map((v, i) => (
                <td key={products[i].code} className="px-3 py-2 align-top text-ink">{v ?? NOT_ON_FILE}</td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr className="border-t border-line">
              <th scope="row" className={th}>Specs</th>
              {products.map((p) => (
                <td key={p.code} className="px-3 py-2">{NOT_ON_FILE}</td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
