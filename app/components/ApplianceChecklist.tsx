'use client';

/**
 * The showApplianceChecklist client-side tool. The model calls it with a
 * userType; this component renders checklistFor(userType) and returns the
 * ticked loads through addToolResult. Watts come from the wattage table
 * unless the user types their own figure.
 */
import { useMemo, useState } from 'react';
import { checklistFor, USER_TYPES, type Appliance } from '@/lib/appliances';
import type { Load } from '@/lib/power';

export type ChecklistResult = { userType: string; loads: Load[] } | { skipped: true };

type Pick = { qty: number; hours: number; watts: string };

const keyOf = (a: Appliance) => `${a.appliance}|${a.variant}`;
const DEFAULT_HOURS = 4;

export function ApplianceChecklist({
  userType: initialType,
  onSubmit,
}: {
  userType: string;
  onSubmit: (r: ChecklistResult) => void;
}) {
  const [userType, setUserType] = useState(USER_TYPES.includes(initialType) ? initialType : 'Residential');
  const [search, setSearch] = useState('');
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [rows, setRows] = useState<Record<string, Appliance>>({});

  const list = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return checklistFor(userType).filter((a) => {
      const text = `${a.appliance} ${a.variant}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [userType, search]);

  function toggle(a: Appliance) {
    const k = keyOf(a);
    setPicks((p) => {
      const next = { ...p };
      if (next[k]) delete next[k];
      else next[k] = { qty: 1, hours: DEFAULT_HOURS, watts: '' };
      return next;
    });
    setRows((r) => ({ ...r, [k]: a }));
  }

  function update(k: string, field: keyof Pick, value: string) {
    setPicks((p) => ({
      ...p,
      [k]: { ...p[k], [field]: field === 'watts' ? value : Number(value) },
    }));
  }

  const chosen = Object.entries(picks);
  const valid = chosen.every(
    ([, p]) =>
      Number.isInteger(p.qty) && p.qty >= 1 && p.qty <= 50 && p.hours >= 0.5 && p.hours <= 24 &&
      (p.watts === '' || Number(p.watts) > 0),
  );

  function submit() {
    const loads: Load[] = chosen.map(([k, p]) => {
      const a = rows[k];
      const own = p.watts === '' ? null : Number(p.watts);
      return {
        name: `${a.appliance} ${a.variant}`,
        running_w: own ?? a.running_w,
        // A typed wattage replaces the table row, so its surge no longer applies.
        surge_w: own === null ? a.surge_w : null,
        qty: p.qty,
        hours: p.hours,
      };
    });
    onSubmit({ userType, loads });
  }

  return (
    <div className="mt-2 w-full space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-slate-600" htmlFor="checklist-purpose">
          Purpose
        </label>
        <select
          id="checklist-purpose"
          value={userType}
          onChange={(e) => setUserType(e.target.value)}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
        >
          {USER_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input
          type="search"
          aria-label="Search appliances"
          placeholder="Search appliances…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1"
        />
      </div>

      <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
        {list.map((a) => {
          const k = keyOf(a);
          const p = picks[k];
          return (
            <li key={k} className="rounded bg-white px-2 py-1">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={!!p} onChange={() => toggle(a)} />
                <span className="flex-1 text-slate-800">
                  {a.appliance} <span className="text-slate-500">{a.variant}</span>
                </span>
                <span className="font-mono text-xs text-slate-500">{a.running_w} W</span>
              </label>
              {p && (
                <div className="mt-1 flex flex-wrap gap-3 pl-6 text-xs text-slate-600">
                  <label>
                    Qty{' '}
                    <input
                      type="number" min={1} max={50} step={1} value={p.qty}
                      onChange={(e) => update(k, 'qty', e.target.value)}
                      className="w-14 rounded border border-slate-300 px-1"
                    />
                  </label>
                  <label>
                    Hours{' '}
                    <input
                      type="number" min={0.5} max={24} step={0.5} value={p.hours}
                      onChange={(e) => update(k, 'hours', e.target.value)}
                      className="w-16 rounded border border-slate-300 px-1"
                    />
                  </label>
                  <label>
                    My watts{' '}
                    <input
                      type="number" min={1} placeholder={String(a.running_w)} value={p.watts}
                      onChange={(e) => update(k, 'watts', e.target.value)}
                      className="w-20 rounded border border-slate-300 px-1"
                    />
                  </label>
                </div>
              )}
            </li>
          );
        })}
        {list.length === 0 && <li className="text-xs text-slate-500">No appliance matches that search.</li>}
      </ul>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={chosen.length === 0 || !valid}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-white disabled:opacity-40"
        >
          Size a power station ({chosen.length})
        </button>
        <button
          type="button"
          onClick={() => onSubmit({ skipped: true })}
          className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-200"
        >
          Skip
        </button>
        {!valid && <span className="text-xs text-rose-700">Qty 1–50, hours 0.5–24, watts above 0.</span>}
      </div>
    </div>
  );
}
