'use client';
/**
 * R6 — a meaningful empty state, not a blank box (docs/ui-design-decisions.md D4). States
 * what the assistant covers and offers the four suggested-prompt chips from docs/spec.md,
 * one per question type, plus category tiles with product photos. A click sends the prompt.
 */
import { CATEGORY_TILES } from '@/lib/photos';
import { Logo, Photo } from './ui';

const PROMPTS = [
  'How much is MED-001-01?',
  'What fire extinguisher types do you carry in 10 lbs?',
  'What safety equipment do you have under ₱500?',
  'What do I need to outfit a construction site?',
];

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2';

export function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center px-4 pb-6 pt-8 text-center sm:pt-14">
      <div className="animate-msg-in">
        <Logo size={64} />
      </div>
      <h1 className="mt-4 animate-msg-in font-heading text-2xl font-bold tracking-tight text-ink sm:text-4xl" style={{ animationDelay: '60ms' }}>
        What can I find for you?
      </h1>
      <p className="mt-2 max-w-xl animate-msg-in text-sm text-muted sm:text-[15px]" style={{ animationDelay: '120ms' }}>
        I search the CTI catalog — 1,056 items of workplace safety, facility and institutional equipment, plus BLUETTI
        power stations — and quote list prices from it. I don&apos;t check stock, quote discounts, or take orders.
      </p>

      <div className="mt-6 grid w-full grid-cols-1 gap-2 sm:mt-8 sm:grid-cols-2">
        {PROMPTS.map((p, i) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            className={`min-h-[44px] animate-card-in rounded-xl border border-line bg-white px-4 py-3 text-left text-sm text-ink shadow-sm transition hover:border-brand hover:bg-brand/10 active:scale-[0.98] ${focus}`}
            style={{ animationDelay: `${180 + i * 60}ms` }}
          >
            {p}
          </button>
        ))}
      </div>

      <h2 className="mt-8 self-start font-heading text-xs font-semibold uppercase tracking-wider text-muted sm:mt-10">Browse by category</h2>
      <div className="-mx-4 mt-3 flex w-[calc(100%+2rem)] snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:w-full sm:grid-cols-6 sm:overflow-visible sm:px-0">
        {CATEGORY_TILES.map((c, i) => (
          <button
            key={c.category}
            type="button"
            onClick={() => onPick(`Show me your ${c.category}.`)}
            className={`w-28 shrink-0 snap-start animate-card-in overflow-hidden rounded-2xl border border-line bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand active:scale-[0.98] sm:w-auto ${focus}`}
            style={{ animationDelay: `${420 + i * 60}ms` }}
          >
            <Photo src={c.img} alt="" size={112} className="w-full" />
            <div className="px-2 py-2 text-xs font-medium text-ink">{c.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
