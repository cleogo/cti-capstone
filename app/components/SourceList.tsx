'use client';

/**
 * The sources under one answer (spec: every answer that used retrieval shows its sources).
 *
 * A "Sources (n)" disclosure with compact rows and doc chips (spec 4.4). It is closed
 * when the answer shows its products through showProducts. It opens by default when
 * the answer has no product list, so the products stay visible (prompt v1 to v3, or a
 * missed showProducts call).
 */
import type { Source } from '@/lib/sources';
import { SourceRow, sourceKey } from './SourceCard';
import { eyebrow } from './ui';

export function SourceList({ sources, defaultOpen = false }: { sources: Source[]; defaultOpen?: boolean }) {
  if (sources.length === 0) return null;
  return (
    <details open={defaultOpen} className="group mt-3" aria-label="Sources for this answer">
      <summary className={`flex min-h-[36px] cursor-pointer list-none items-center gap-1.5 text-muted ${eyebrow} hover:text-ink`}>
        <span className="transition-transform group-open:rotate-90" aria-hidden="true">›</span>
        Sources ({sources.length})
      </summary>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        {sources.map((s, i) => (
          <SourceRow key={sourceKey(s, i)} source={s} i={i} />
        ))}
      </div>
    </details>
  );
}
