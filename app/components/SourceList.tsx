'use client';

/**
 * The sources under one answer (spec: every answer that used retrieval shows its sources).
 *
 * Mobile first: products are a horizontal snap row of photo cards, so a long result never
 * pushes the next question far down. From 640 px the row becomes a 3-column grid that shows
 * the first 6, with "Show all" for the rest. Guide sections and knowledge sheets are chips.
 */
import { useState } from 'react';
import type { GuideSource, ProductSource, SheetSource, Source } from '@/lib/sources';
import { DocChip, ProductCard, sourceKey, sourcesHeading } from './SourceCard';

const GRID_COUNT = 6;

export function SourceList({ sources, onAsk }: { sources: Source[]; onAsk?: (prompt: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  if (sources.length === 0) return null;

  const products = sources.filter((s): s is ProductSource => s.kind === 'product');
  const docs = sources.filter((s): s is GuideSource | SheetSource => s.kind !== 'product');
  const hidden = products.length - GRID_COUNT;

  return (
    <section className="mt-3" aria-label="Sources for this answer">
      {sourcesHeading(sources.length)}
      {products.length > 0 && (
        <div className="-mx-4 mt-2 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
          {products.map((p, i) => (
            <div key={p.code} className={`contents ${!expanded && i >= GRID_COUNT ? 'sm:hidden' : ''}`}>
              <ProductCard source={p} i={i} onAsk={onAsk} />
            </div>
          ))}
        </div>
      )}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 hidden min-h-[36px] text-xs font-medium text-link hover:underline sm:inline-flex sm:items-center"
        >
          {expanded ? 'Show fewer' : `Show all ${products.length}`}
        </button>
      )}
      {docs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {docs.map((d, i) => (
            <DocChip key={sourceKey(d, i)} source={d} />
          ))}
        </div>
      )}
    </section>
  );
}
