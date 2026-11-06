'use client';

/** Up to 3 follow-up chips under the latest answer (spec 6.2). Each one sends a chat prompt. */
import type { Chip } from '@/lib/display';

export function FollowUpChips({ chips, onAsk }: { chips: Chip[]; onAsk: (prompt: string) => void }) {
  if (chips.length === 0) return null;
  return (
    <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Suggested follow-ups">
      {chips.map((c, i) => (
        <button
          key={c.label}
          type="button"
          onClick={() => onAsk(c.prompt)}
          className="min-h-[36px] shrink-0 animate-card-in rounded-full border border-line bg-white px-3.5 text-sm text-ink shadow-sm transition hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink active:scale-[0.97]"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
