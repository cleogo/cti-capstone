'use client';

/**
 * The products one answer displays, from a showProducts result (spec 4).
 *
 * 5 or fewer: photo cards, a snap row on a phone and a grid from 640 px.
 * 6 or more: a table. A tap on a card or a row opens the detail sheet.
 * "Select" shows checkboxes for compare select (spec 6.4). Prices come from
 * price_php in the tool result only.
 */
import { useState } from 'react';
import { formatPeso, type ShowProductsResult, type ShownProduct } from '@/lib/display';
import { photoFor } from '@/lib/photos';
import { ProductCard, SelectBox, isConflict, askSalesPrompt } from './SourceCard';
import { IconAlert, Photo, eyebrow, stagger } from './ui';

const CARD_MAX = 5;
const TABLE_FIRST = 10;
export const TRAY_MAX = 4;

export function ProductList({
  result,
  onOpen,
  onAsk,
  tray = [],
  onToggleTray,
}: {
  result: ShowProductsResult;
  onOpen?: (p: ShownProduct) => void;
  onAsk?: (prompt: string) => void;
  tray?: string[];
  onToggleTray?: (code: string) => void;
}) {
  const [selecting, setSelecting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const products = result.products ?? [];
  if (products.length === 0) return null;

  const full = tray.length >= TRAY_MAX;
  const disabled = (code: string) => full && !tray.includes(code);
  const canSelect = !!onToggleTray && products.length > 1;

  return (
    <section className="mt-3" aria-label="Products for this answer">
      <div className="flex min-h-[36px] items-center justify-between gap-2">
        <span className={`text-muted ${eyebrow}`}>Products ({products.length})</span>
        {canSelect && (
          <button
            type="button"
            onClick={() => setSelecting((v) => !v)}
            aria-pressed={selecting}
            className="min-h-[36px] rounded-lg px-2 text-xs font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            {selecting ? 'Done' : 'Select'}
          </button>
        )}
      </div>
      {selecting && full && <p className="mb-1 text-xs text-muted">4 products at most</p>}

      {products.length <= CARD_MAX ? (
        <div className="-mx-4 mt-1 flex snap-x gap-3 overflow-x-auto px-4 pb-2 pr-6 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
          {products.map((p, i) => (
            <ProductCard
              key={p.code}
              product={p}
              i={i}
              onOpen={onOpen}
              onAsk={onAsk}
              selectable={selecting}
              selected={tray.includes(p.code)}
              selectDisabled={disabled(p.code)}
              onToggle={onToggleTray}
            />
          ))}
        </div>
      ) : (
        <>
          <div className="-ml-11 mt-1 overflow-hidden rounded-2xl border border-line bg-white shadow-sm sm:ml-0">
            <table className="w-full table-fixed text-left text-sm" aria-label="Products">
              <thead className="hidden sm:table-header-group">
                <tr className={`border-b border-line text-muted ${eyebrow}`}>
                  {selecting && <th className="w-11" aria-label="Select" />}
                  <th className="w-[68px]" aria-label="Photo" />
                  <th className="px-3 py-2">Product</th>
                  <th className="hidden w-36 px-3 py-2 sm:table-cell">Code</th>
                  <th className="hidden w-28 px-3 py-2 sm:table-cell">Colours</th>
                  <th className="hidden w-14 px-3 py-2 sm:table-cell">Page</th>
                  <th className="w-[104px] px-3 py-2 text-right">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {products.slice(0, expanded ? products.length : TABLE_FIRST).map((p, i) => {
                  const flagged = isConflict(p);
                  return (
                    <tr
                      key={p.code}
                      className={`relative animate-card-in transition hover:bg-paper ${flagged ? 'bg-red-50' : ''} ${tray.includes(p.code) ? 'bg-brand/10' : ''}`}
                      style={stagger(i, 40)}
                    >
                      {selecting && onToggleTray && (
                        <td className="relative z-10 w-11 pl-1">
                          <SelectBox code={p.code} selected={tray.includes(p.code)} disabled={disabled(p.code)} onToggle={onToggleTray} />
                        </td>
                      )}
                      <td className="w-[68px] py-2 pl-3">
                        <Photo src={photoFor(p.code, p.data_quality_flag)} alt="" size={56} className="w-14 rounded-lg" />
                      </td>
                      <td className="min-w-0 px-3 py-2">
                        <button
                          type="button"
                          onClick={() => onOpen?.(p)}
                          aria-haspopup="dialog"
                          className="text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ink"
                        >
                          <span className="line-clamp-3 font-semibold leading-snug text-ink sm:line-clamp-2">{p.name}</span>
                        </button>
                        {p.category && <div className="truncate text-xs text-muted">{p.category}</div>}
                        <div className={`font-mono text-[11px] sm:hidden ${flagged ? 'text-red-800' : 'text-faint'}`}>{p.code}</div>
                      </td>
                      <td className="hidden truncate px-3 py-2 font-mono text-xs text-faint sm:table-cell">{p.code}</td>
                      <td className="hidden truncate px-3 py-2 text-xs text-muted sm:table-cell">{p.colors?.join(', ') || '—'}</td>
                      <td className="hidden px-3 py-2 text-xs tabular-nums text-faint sm:table-cell">{p.page ?? '—'}</td>
                      <td className="w-[104px] whitespace-nowrap py-2 pl-1 pr-3 text-right align-middle">
                        {flagged ? (
                          <span className="relative z-10 inline-flex flex-col items-end gap-1">
                            <span className="flex items-center gap-1 text-[11px] font-medium text-red-700">
                              <IconAlert className="h-3.5 w-3.5" /> Price conflict
                            </span>
                            {onAsk && (
                              <button type="button" onClick={() => onAsk(askSalesPrompt(p.code))} className="min-h-[36px] text-xs font-medium text-link hover:underline">
                                Ask CTI sales
                              </button>
                            )}
                          </span>
                        ) : (
                          p.price_php !== null && <span className="font-heading font-semibold tabular-nums text-ink">{formatPeso(p.price_php)}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {products.length > TABLE_FIRST && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="mt-1 inline-flex min-h-[36px] items-center text-xs font-medium text-link hover:underline"
            >
              {expanded ? 'Show fewer' : `Show all ${products.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
