'use client';

/**
 * The recommendPowerStation result as a card (docs/ui-design-decisions.md D6). Every figure
 * comes from the tool result (lib/power.ts). Nothing here reads model text.
 */
import type { Load, Recommendation, StationResult } from '@/lib/power';
import { DOD, INVERTER_EFFICIENCY, HEADROOM } from '@/lib/power';
import { photoFor } from '@/lib/photos';
import { formatPeso } from './SourceCard';
import { card, eyebrow, IconAlert, IconBattery, Photo, stagger } from './ui';

type Result = Recommendation | { error: string; message?: string };

const n = (x: number) => x.toLocaleString('en-PH', { maximumFractionDigits: 2 });

function Meter({ label, value, max, unit }: { label: string; value: number; max: number; unit: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 100;
  return (
    <div>
      <div className="flex justify-between gap-2 text-[11px] text-muted">
        <span>{label}</span>
        <span className="shrink-0 font-mono tabular-nums">
          {n(value)} / {n(max)} {unit}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line" role="meter" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full origin-left animate-grow rounded-full ${pct > 90 ? 'bg-amber-500' : 'bg-emerald-600'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Pick({ r, label, i }: { r: StationResult; label: string; i: number }) {
  return (
    <div className={`flex animate-card-in flex-col overflow-hidden ${card} ${i === 0 ? 'ring-2 ring-emerald-600/30' : ''}`} style={stagger(i, 90)}>
      <div className="flex gap-3 p-3">
        <Photo src={photoFor(r.code)} alt={r.model} size={80} className="w-16 rounded-xl sm:w-20" icon={<IconBattery className="h-7 w-7" />} />
        <div className="min-w-0 flex-1">
          <span className={`inline-block rounded-full px-2 py-0.5 ${eyebrow} ${i === 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-paper text-muted'}`}>{label}</span>
          <div className="mt-1 font-heading font-semibold leading-snug text-ink">{r.model}</div>
          <div className="font-mono text-[11px] text-faint">{r.code}</div>
          <div className="mt-1 font-heading font-semibold tabular-nums text-ink">{formatPeso(r.price_php)}</div>
        </div>
      </div>
      <div className="mt-auto space-y-2 border-t border-line bg-paper/50 px-3 py-3">
        <div className="flex items-baseline gap-1.5">
          <span className="font-heading text-2xl font-bold tabular-nums text-ink">{n(r.runtime_h)} h</span>
          <span className="text-xs text-muted">runtime on this load</span>
        </div>
        <Meter label={`Power needed (running × ${HEADROOM})`} value={r.running_w * HEADROOM} max={r.rated_w} unit="W" />
        <Meter label="Start-up peak" value={r.peak_w} max={r.rated_w} unit="W" />
        {r.energy_wh !== null && <Meter label="Energy needed" value={r.energy_wh} max={r.usable_wh} unit="Wh" />}
      </div>
    </div>
  );
}

/** Stations that can run the load, longest runtime first (lib/power.ts runtime). */
function RuntimeList({ runtime, mode }: { runtime: StationResult[]; mode: Recommendation['mode'] }) {
  const max = runtime[0].runtime_h;
  return (
    <div className={`animate-card-in ${card} px-4 py-3`}>
      <div className={`${eyebrow} text-muted`}>
        {mode === 'sizing' ? 'No station covers all the hours. How long each one runs this load:' : 'How long each station runs this load:'}
      </div>
      <ul className="mt-2 space-y-2">
        {runtime.map((r, i) => (
          <li key={r.code} className="animate-card-in" style={stagger(i, 40)}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0">
                <span className="font-medium text-ink">{r.model}</span> <span className="font-mono text-[11px] text-faint">{r.code}</span>
              </span>
              <span className="shrink-0 tabular-nums">
                <span className="font-heading font-semibold text-ink">{n(r.runtime_h)} h</span>
                <span className="ml-2 text-xs text-muted">{formatPeso(r.price_php)}</span>
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
              <div className="h-full origin-left animate-grow rounded-full bg-emerald-600" style={{ width: `${max > 0 ? (r.runtime_h / max) * 100 : 0}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type Approximation = { asked: string; name: string; running_w: number };

export function RecommendationCard({ loads, result, approximate = [] }: { loads: Load[]; result: Result; approximate?: Approximation[] }) {
  if ('error' in result) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <IconAlert className="h-4 w-4" /> Could not size a station: {result.message ?? result.error}
      </div>
    );
  }
  const [first, next] = result.eligible;

  return (
    <div className="mt-3 w-full space-y-3">
      {approximate.map((a) => (
        <div key={a.asked} role="note" className="flex gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            We have no details on file for &ldquo;{a.asked}&rdquo;. These figures use the nearest appliance on file:{' '}
            <strong className="font-semibold">{a.name}</strong>, {n(a.running_w)} W. Tell us the watts on the appliance label and the
            hours of use per day, and we can size it exactly.
          </span>
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5">
        {loads.map((l, i) => (
          <span key={i} className="animate-card-in rounded-full border border-line bg-white px-2.5 py-1 text-xs text-muted" style={stagger(i, 40)}>
            {l.qty} × {l.name} · {n(l.running_w)} W{l.surge_w !== null ? ` (start-up ${n(l.surge_w)} W)` : ''}{l.hours !== null ? ` · ${n(l.hours)} h` : ''}
          </span>
        ))}
      </div>

      {first ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Pick r={first} label="Smallest fit" i={0} />
            {next && <Pick r={next} label="One step up" i={1} />}
          </div>
          <details className={`animate-card-in ${card} px-4 py-3 text-sm`}>
            <summary className="min-h-[28px] cursor-pointer font-medium text-ink">How {first.model} was sized</summary>
            <table className="mt-2 w-full text-xs text-muted">
              <tbody>
                {(
                  [
                    ["Running load, with the station's own use", `${n(first.running_w)} W`],
                    [`Needed rating (running × ${HEADROOM})`, `${n(first.running_w * HEADROOM)} W ≤ ${n(first.rated_w)} W`],
                    ['Start-up peak', `${n(first.peak_w)} W ≤ ${n(first.rated_w)} W`],
                    ['Energy needed', first.energy_wh === null ? '—' : `${n(first.energy_wh)} Wh`],
                    [`Usable energy (capacity × ${DOD} × ${INVERTER_EFFICIENCY})`, `${n(first.usable_wh)} Wh`],
                    ['Runtime (usable ÷ running)', `${n(first.runtime_h)} h`],
                  ] as const
                ).map(([k, v]) => (
                  <tr key={k} className="border-t border-line">
                    <td className="py-1.5 pr-2">{k}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-ink">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      ) : result.runtime.length > 0 ? (
        <RuntimeList runtime={result.runtime} mode={result.mode} />
      ) : (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <IconAlert className="h-4 w-4" /> No power station on sale can start this load.
        </div>
      )}

      {result.rejected.length > 0 && (
        <details className="px-1 text-xs text-muted">
          <summary className="min-h-[28px] cursor-pointer font-medium">
            {result.rejected.length} station{result.rejected.length === 1 ? '' : 's'} do not fit
          </summary>
          <ul className="mt-1 space-y-0.5">
            {result.rejected.map((r) => (
              <li key={r.code}>
                <span className="font-medium text-ink">{r.model}</span> <span className="font-mono">{r.code}</span>: {r.reasons.join('; ')}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
