'use client';

/**
 * The showApplianceChecklist client-side tool. The model calls it with a userType; this
 * component renders checklistFor(userType) and returns the ticked loads through
 * addToolResult. Watts come from the wattage table unless the user types their own figure.
 * Design: docs/ui-design-decisions.md D6.
 */
import { useMemo, useState } from 'react';
import { checklistFor, USER_TYPES, type Appliance } from '@/lib/appliances';
import type { Load } from '@/lib/power';
import { btnGhost, btnPrimary, card, eyebrow, field, IconBattery, IconCheck, IconSearch } from './ui';

export type ChecklistResult = { userType: string; loads: Load[] } | { skipped: true };

type Pick = { qty: number; hours: number; watts: string };

const keyOf = (a: Appliance) => `${a.appliance}|${a.variant}`;
const DEFAULT_HOURS = 4;

/** The one-line chip that replaces the checklist once the user answers. */
export function ChecklistDone({ result }: { result: ChecklistResult }) {
  return (
    <div className="mt-3 inline-flex animate-card-in items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-xs text-muted">
      <IconCheck className="h-4 w-4 text-emerald-700" />
      {'skipped' in result ? 'Checklist skipped' : `Checklist sent: ${result.loads.length} appliance${result.loads.length === 1 ? '' : 's'}`}
    </div>
  );
}

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

  function update(k: string, f: keyof Pick, value: string) {
    setPicks((p) => ({ ...p, [k]: { ...p[k], [f]: f === 'watts' ? value : Number(value) } }));
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
    <div className={`mt-3 w-full animate-card-in overflow-hidden ${card}`}>
      <div className="border-b border-line bg-paper/60 px-4 py-3">
        <div className={`text-link ${eyebrow}`}>Step 1 of 2 · Your appliances</div>
        <div className="mt-0.5 font-heading font-semibold text-ink">What do you want to run on backup power?</div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="checklist-purpose">
            Purpose
          </label>
          <select id="checklist-purpose" value={userType} onChange={(e) => setUserType(e.target.value)} className={`${field} sm:w-52`}>
            {USER_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <div className="relative flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <input
              type="search"
              aria-label="Search appliances"
              placeholder="Search appliances…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${field} pl-9`}
            />
          </div>
        </div>
      </div>

      <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto overscroll-contain sm:max-h-80">
        {list.map((a) => {
          const k = keyOf(a);
          const p = picks[k];
          return (
            <li key={k} className={`px-4 py-2.5 transition-colors ${p ? 'bg-brand/10' : ''}`}>
              <label className="flex min-h-[36px] cursor-pointer items-center gap-3">
                <input type="checkbox" checked={!!p} onChange={() => toggle(a)} className="h-5 w-5 shrink-0 accent-ink" />
                <span className="flex-1 text-sm text-ink">
                  {a.appliance} <span className="text-muted">{a.variant}</span>
                </span>
                <span className="shrink-0 rounded-md bg-paper px-1.5 py-0.5 font-mono text-xs text-muted">{a.running_w} W</span>
              </label>
              {p && (
                <div className="mt-2 grid animate-msg-in grid-cols-3 gap-2 pl-8 text-xs text-muted sm:flex sm:flex-wrap sm:gap-3">
                  <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-1.5">
                    Qty
                    <input type="number" inputMode="numeric" min={1} max={50} step={1} value={p.qty} onChange={(e) => update(k, 'qty', e.target.value)} className={`${field} px-2 py-1 sm:w-16`} />
                  </label>
                  <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-1.5">
                    Hours a day
                    <input type="number" inputMode="decimal" min={0.5} max={24} step={0.5} value={p.hours} onChange={(e) => update(k, 'hours', e.target.value)} className={`${field} px-2 py-1 sm:w-20`} />
                  </label>
                  <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-1.5">
                    My watts
                    <input type="number" inputMode="numeric" min={1} placeholder={String(a.running_w)} value={p.watts} onChange={(e) => update(k, 'watts', e.target.value)} className={`${field} px-2 py-1 sm:w-20`} />
                  </label>
                </div>
              )}
            </li>
          );
        })}
        {list.length === 0 && <li className="px-4 py-3 text-xs text-muted">No appliance matches that search.</li>}
      </ul>

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        <button type="button" onClick={submit} disabled={chosen.length === 0 || !valid} className={`${btnPrimary} flex-1 sm:flex-none`}>
          <IconBattery /> Size a power station{chosen.length > 0 && ` (${chosen.length})`}
        </button>
        <button type="button" onClick={() => onSubmit({ skipped: true })} className={btnGhost}>
          Skip
        </button>
        {!valid && (
          <span className="w-full text-xs text-red-700" role="alert">
            Qty 1–50, hours 0.5–24, watts above 0.
          </span>
        )}
      </div>
    </div>
  );
}
