/**
 * The recommendPowerStation result as a card. Every figure comes from the
 * tool result (lib/power.ts). Nothing here reads model text.
 */
import type { Load, StationResult } from '@/lib/power';
import { DOD, INVERTER_EFFICIENCY, HEADROOM } from '@/lib/power';
import { formatPeso } from './SourceCard';

type Result = { eligible: StationResult[]; rejected: StationResult[] } | { error: string; message?: string };

const n = (x: number) => x.toLocaleString('en-PH', { maximumFractionDigits: 2 });

function Pick({ r, label }: { r: StationResult; label: string }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
      <div className="text-xs font-medium uppercase tracking-wide text-emerald-700">{label}</div>
      <div className="font-semibold text-slate-900">
        {r.model} <span className="font-mono text-xs text-slate-500">{r.code}</span>
      </div>
      <div className="text-slate-800">{formatPeso(r.price_php)}</div>
      <div className="text-xs text-slate-600">Runs about {n(r.runtime_h)} h on this load</div>
    </div>
  );
}

export function RecommendationCard({ loads, result }: { loads: Load[]; result: Result }) {
  if ('error' in result) {
    return <div className="text-sm text-rose-700">Could not size a station: {result.message ?? result.error}</div>;
  }
  const [first, next] = result.eligible;

  return (
    <div className="mt-2 w-full space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Loads</div>
        <ul className="text-slate-700">
          {loads.map((l, i) => (
            <li key={i}>
              {l.qty} × {l.name}: {n(l.running_w)} W
              {l.surge_w !== null ? ` (start-up ${n(l.surge_w)} W)` : ''}, {n(l.hours)} h
            </li>
          ))}
        </ul>
      </div>

      {first ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <Pick r={first} label="Smallest fit" />
            {next && <Pick r={next} label="One step up" />}
          </div>
          <table className="w-full text-xs text-slate-700">
            <caption className="mb-1 text-left font-medium text-slate-500">The maths for {first.model}</caption>
            <tbody>
              <tr>
                <td className="py-0.5">Running load, with the station&apos;s own use</td>
                <td className="text-right font-mono">{n(first.running_w)} W</td>
              </tr>
              <tr>
                <td className="py-0.5">Needed rating (running × {HEADROOM})</td>
                <td className="text-right font-mono">
                  {n(first.running_w * HEADROOM)} W ≤ {n(first.rated_w)} W
                </td>
              </tr>
              <tr>
                <td className="py-0.5">Start-up peak</td>
                <td className="text-right font-mono">
                  {n(first.peak_w)} W ≤ {n(first.rated_w)} W
                </td>
              </tr>
              <tr>
                <td className="py-0.5">Energy needed</td>
                <td className="text-right font-mono">{n(first.energy_wh)} Wh</td>
              </tr>
              <tr>
                <td className="py-0.5">
                  Usable energy (capacity × {DOD} × {INVERTER_EFFICIENCY})
                </td>
                <td className="text-right font-mono">{n(first.usable_wh)} Wh</td>
              </tr>
              <tr>
                <td className="py-0.5">Runtime (usable ÷ running)</td>
                <td className="text-right font-mono">{n(first.runtime_h)} h</td>
              </tr>
            </tbody>
          </table>
        </>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
          No power station on sale fits this load.
        </div>
      )}

      {result.rejected.length > 0 && (
        <details open>
          <summary className="cursor-pointer text-xs font-medium text-slate-500">
            {result.rejected.length} station{result.rejected.length === 1 ? '' : 's'} do not fit
          </summary>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
            {result.rejected.map((r) => (
              <li key={r.code}>
                <span className="font-medium text-slate-800">{r.model}</span>{' '}
                <span className="font-mono">{r.code}</span>: {r.reasons.join('; ')}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
