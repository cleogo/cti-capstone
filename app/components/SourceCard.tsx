'use client';

/**
 * Retrieved sources, rendered as evidence for the answer beside them.
 *
 * Price always renders from `price_php` — never from anything the model wrote — which is
 * what CLAUDE.md calls the guarantee that makes the shown number exact. These components
 * only ever read structured tool-result fields, never message text.
 *
 * A duplicate_code_conflict product shows no price and no photo. It shows a warning and an
 * "Ask CTI sales" button instead (CLAUDE.md: warn and refer to sales).
 */
import type { GuideSource, ProductSource, SheetSource, Source } from '@/lib/sources';
import { photoFor } from '@/lib/photos';
import { formatPeso, type ShownProduct } from '@/lib/display';
import { card, eyebrow, IconAlert, IconBook, IconHeadset, IconLink, Photo, btnSmallDark, stagger } from './ui';

export { formatPeso };

export const isConflict = (s: { data_quality_flag?: string }) => s.data_quality_flag === 'duplicate_code_conflict';

export const sourceKey = (s: Source, i: number) =>
  s.kind === 'product' ? s.code : s.kind === 'sheet' ? s.slug : `${s.title}::${s.heading}::${i}`;

/** The sales hand-off message a conflict card sends. */
export const askSalesPrompt = (code: string) => `Refer me to CTI sales about the price of ${code}.`;

/** The 44 px select checkbox for compare select (spec 6.4). */
export function SelectBox({ code, selected, disabled, onToggle, className = '' }: { code: string; selected: boolean; disabled: boolean; onToggle: (code: string) => void; className?: string }) {
  return (
    <label className={`flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center ${disabled ? 'cursor-not-allowed opacity-40' : ''} ${className}`}>
      <input
        type="checkbox"
        checked={selected}
        disabled={disabled}
        onChange={() => onToggle(code)}
        aria-label={`Select ${code} to compare`}
        className="h-5 w-5 accent-ink"
      />
    </label>
  );
}

/** Photo card for one product (spec 4.1). The card body opens the detail sheet. */
export function ProductCard({
  product: p,
  i,
  onOpen,
  onAsk,
  selectable = false,
  selected = false,
  selectDisabled = false,
  onToggle,
}: {
  product: ShownProduct;
  i: number;
  onOpen?: (p: ShownProduct) => void;
  onAsk?: (prompt: string) => void;
  selectable?: boolean;
  selected?: boolean;
  selectDisabled?: boolean;
  onToggle?: (code: string) => void;
}) {
  const flagged = isConflict(p);
  return (
    <article
      className={`relative flex w-40 shrink-0 snap-start animate-card-in flex-col overflow-hidden transition sm:w-auto ${
        flagged ? 'rounded-2xl border border-red-200 bg-red-50' : `${card} hover:-translate-y-0.5 hover:border-brand hover:shadow-md`
      } ${selected ? 'ring-2 ring-ink' : ''}`}
      style={stagger(i)}
    >
      <button
        type="button"
        onClick={() => onOpen?.(p)}
        className="flex flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink active:scale-[0.99]"
        aria-label={`${p.name}, ${p.code}. Show details`}
      >
        <Photo src={photoFor(p.code, p.data_quality_flag)} alt={p.name} size={160} className="w-full" />
        <div className="flex w-full flex-1 flex-col gap-1 p-3">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">{p.name}</h3>
          {p.category && <div className="truncate text-xs text-muted">{p.category}</div>}
          <div className="mt-auto pt-1">
            {flagged ? (
              <div className="flex items-start gap-1 text-[11px] font-medium leading-tight text-red-700">
                <IconAlert className="h-3.5 w-3.5" /> Conflicting price on record
              </div>
            ) : (
              p.price_php !== null && (
                <div className="font-heading text-base font-semibold tabular-nums text-ink">{formatPeso(p.price_php)}</div>
              )
            )}
            <div className={`font-mono text-[11px] ${flagged ? 'text-red-800' : 'text-faint'}`}>{p.code}</div>
          </div>
        </div>
      </button>
      {flagged && onAsk && (
        <div className="px-3 pb-3">
          <button type="button" onClick={() => onAsk(askSalesPrompt(p.code))} className={btnSmallDark}>
            <IconHeadset className="h-4 w-4" /> Ask CTI sales
          </button>
        </div>
      )}
      {selectable && onToggle && (
        <SelectBox code={p.code} selected={selected} disabled={selectDisabled} onToggle={onToggle} className="absolute right-0 top-0 rounded-bl-xl bg-white/90" />
      )}
    </article>
  );
}

/** A guide section or a knowledge sheet, as a small chip. */
export function DocChip({ source }: { source: GuideSource | SheetSource }) {
  const chip = 'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs';
  if (source.kind === 'guide') {
    return (
      <span className={`${chip} border-amber-200 bg-amber-50 text-amber-900`}>
        <IconBook className="h-3.5 w-3.5" />
        <span className="truncate">
          {source.title} · {source.heading}
        </span>
      </span>
    );
  }
  return (
    <a href={source.url} target="_blank" rel="noopener noreferrer" className={`${chip} border-sky-200 bg-sky-50 text-sky-900 hover:underline`}>
      <IconLink className="h-3.5 w-3.5" />
      <span className="truncate">Knowledge sheet: {source.slug}</span>
    </a>
  );
}

/** One compact row for the desktop sources panel. */
export function SourceRow({ source, i }: { source: Source; i: number }) {
  if (source.kind !== 'product') {
    return (
      <div className="animate-card-in" style={stagger(i, 40)}>
        <DocChip source={source} />
      </div>
    );
  }
  const p = source;
  const flagged = isConflict(p);
  return (
    <div className={`flex animate-card-in gap-3 rounded-xl border p-2 ${flagged ? 'border-red-200 bg-red-50' : 'border-line bg-white'}`} style={stagger(i, 40)}>
      <Photo src={photoFor(p.code, p.data_quality_flag)} alt={p.name} size={40} className="w-10 rounded-lg" />
      <div className="min-w-0 flex-1 text-xs">
        <div className="flex justify-between gap-2">
          <span className="font-mono text-faint">{p.code}</span>
          {flagged ? (
            <span className="font-semibold text-red-700">Price conflict</span>
          ) : (
            <span className="font-semibold tabular-nums text-ink">{formatPeso(p.price_php)}</span>
          )}
        </div>
        <div className="truncate text-ink">{p.name}</div>
        <div className="flex justify-between gap-2 text-faint">
          {p.category && <span className="truncate">{p.category}</span>}
          {p.page !== undefined && <span className="shrink-0 tabular-nums">p.{p.page}</span>}
        </div>
      </div>
    </div>
  );
}

export const sourcesHeading = (n: number) => (
  <div className={`text-muted ${eyebrow}`}>Sources ({n})</div>
);
