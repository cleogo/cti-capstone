'use client';

/**
 * The product detail sheet (spec 5). A bottom sheet on a phone and a centred
 * modal from 640 px, both on a native <dialog>, so the browser gives the focus
 * trap, Escape and the backdrop.
 *
 * It opens at once with the record the card holds. Only the knowledge sheet
 * loads, from GET /api/products/<code>. The price comes from that record
 * (price_php), never from model text.
 *
 * History: opening pushes one history entry, so the phone back gesture closes
 * the sheet. A close by X, Escape or the backdrop pops that entry again.
 */
import { useEffect, useRef, useState } from 'react';
import type { DetailsResult } from '@/lib/details';
import { formatPeso, type ShownProduct } from '@/lib/display';
import { photoFor } from '@/lib/photos';
import { askSalesPrompt, isConflict } from './SourceCard';
import { IconAlert, IconHeadset, IconLink, IconPlus, IconReplay, Photo, btnPrimary, btnGhost } from './ui';

type Load = { state: 'loading' } | { state: 'error' } | { state: 'done'; details: DetailsResult };

export function ProductSheet({
  product: p,
  onClose,
  onAsk,
  onCompare,
}: {
  product: ShownProduct | null;
  onClose: () => void;
  onAsk: (prompt: string) => void;
  onCompare: (code: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const code = p?.code;

  // Open and close the dialog, and keep one history entry while it is open.
  useEffect(() => {
    const d = dialog.current;
    if (!d || !code) return;
    if (!d.open) d.showModal();
    history.pushState({ productSheet: code }, '');
    const onPop = () => onClose();
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (d.open) d.close();
    };
  }, [code, onClose]);

  // Load the sheet. Abort when the code changes, so a slow answer for an
  // earlier product never shows under a later one.
  useEffect(() => {
    if (!code) return;
    const ctrl = new AbortController();
    setLoad({ state: 'loading' });
    fetch(`/api/products/${encodeURIComponent(code)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<DetailsResult>) : Promise.reject(new Error(String(r.status)))))
      .then((details) => setLoad({ state: 'done', details }))
      .catch(() => {
        if (!ctrl.signal.aborted) setLoad({ state: 'error' });
      });
    return () => ctrl.abort();
  }, [code, attempt]);

  /** Close by X, Escape, the backdrop or an action: pop our history entry first. */
  function close() {
    if (history.state?.productSheet) history.back();
    else onClose();
  }

  function send(prompt: string) {
    close();
    onAsk(prompt);
  }

  const flagged = p ? isConflict(p) : false;
  const sheet = load.state === 'done' ? load.details.sheet : null;

  return (
    <dialog
      ref={dialog}
      aria-label={p ? `${p.name} details` : 'Product details'}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) close();
      }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 flex max-h-[90dvh] w-full max-w-none flex-col overflow-hidden rounded-t-[20px] bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/50 open:animate-msg-in sm:inset-0 sm:m-auto sm:h-fit sm:max-w-[480px] sm:rounded-[20px]"
    >
      {p && (
        <>
          <div className="relative flex shrink-0 items-center justify-center pt-2 sm:pt-3">
            <span className="h-1.5 w-10 rounded-full bg-line sm:hidden" aria-hidden="true" />
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="absolute right-2 top-1 flex h-11 w-11 items-center justify-center rounded-full text-2xl leading-none text-muted hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              ×
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-2">
            <Photo src={photoFor(p.code, p.data_quality_flag)} alt={p.name} size={280} className="mx-auto w-full max-w-[280px] rounded-2xl bg-white" />
            <h2 className="mt-4 font-heading text-xl font-bold leading-snug">{p.name}</h2>
            {p.category && <p className="mt-0.5 text-[13px] text-muted">{p.category}</p>}

            {flagged ? (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
                The masterlist holds conflicting prices for this code. CTI sales must confirm the price.
              </div>
            ) : (
              p.price_php !== null && <p className="mt-3 font-heading text-2xl font-semibold tabular-nums">{formatPeso(p.price_php)}</p>
            )}

            <dl className="mt-4 divide-y divide-line border-y border-line text-sm">
              <Row label="Code" value={<span className="font-mono">{p.code}</span>} />
              {p.colors && p.colors.length > 0 && <Row label="Colours" value={p.colors.join(', ')} />}
              {p.page !== undefined && <Row label="Price-list page" value={String(p.page)} />}
              {sheet?.specs.map((s) => <Row key={s.label} label={s.label} value={s.value} />)}
            </dl>

            {load.state === 'loading' && (
              <div className="mt-4 space-y-2" role="status" aria-label="Loading specifications">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-4 animate-pulse rounded bg-line" style={{ width: `${90 - i * 20}%` }} />
                ))}
              </div>
            )}
            {load.state === 'error' && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-paper p-3 text-sm">
                Specs could not load.
                <button type="button" onClick={() => setAttempt((n) => n + 1)} className={btnGhost}>
                  <IconReplay className="h-4 w-4" /> Retry
                </button>
              </div>
            )}
            {load.state === 'done' && !sheet && (
              <p className="mt-4 rounded-xl bg-paper p-3 text-sm text-muted">Specifications not on file. CTI sales can confirm them.</p>
            )}

            {sheet && (
              <div className="mt-4 space-y-3 text-sm leading-relaxed">
                <Section title="Usage" text={sheet.usage} />
                <Section title="Advantages" text={sheet.advantages} />
                <Section title="Cautions" text={sheet.cautions} />
                {sheet.sources[0] && (
                  <a href={sheet.sources[0]} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[36px] items-center gap-1.5 text-link hover:underline">
                    <IconLink className="h-4 w-4" /> Source
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="flex shrink-0 gap-2 border-t border-line bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {!flagged && (
              <button type="button" onClick={() => send(`Add ${p.code} to my quote.`)} className={`${btnPrimary} min-h-[44px] flex-1`}>
                <IconPlus className="h-4 w-4" /> Add to quote
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onCompare(p.code);
                close();
              }}
              className={`${btnGhost} min-h-[44px] flex-1`}
            >
              Compare
            </button>
            <button type="button" onClick={() => send(flagged ? askSalesPrompt(p.code) : `Refer me to CTI sales about ${p.code}.`)} className={`${btnGhost} min-h-[44px] flex-1`}>
              <IconHeadset className="h-4 w-4" /> Ask sales
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function Section({ title, text }: { title: string; text: string }) {
  if (!text) return null;
  return (
    <div>
      <h3 className="font-semibold">{title}</h3>
      <p className="text-muted">{text}</p>
    </div>
  );
}
