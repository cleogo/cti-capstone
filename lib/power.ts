/**
 * Power-station sizing (PRD F4). Code does every figure. The model only
 * picks the loads and explains the result.
 *
 * STATIONS comes from data/bluetti/stations.json, which
 * scripts/clean_bluetti.py generates. scripts/calc_cases.py works the same
 * formulas in Python without this module; tests/power.test.ts holds both to
 * the same numbers.
 */
import raw from '@/data/bluetti/stations.json';
import { APPLIANCES } from '@/lib/appliances';

export const DOD = 0.9;
export const INVERTER_EFFICIENCY = 0.85;
export const HEADROOM = 1.2;

/** hours null: the customer gave no hours. Sizing then checks watts only and reports runtime. */
export type Load = { name: string; running_w: number; surge_w: number | null; qty: number; hours: number | null };

export type Station = {
  code: string;
  model: string;
  rated_w: number;
  capacity_wh: number;
  self_consumption_w: number;
  price_php: number;
};

export type StationResult = {
  code: string;
  model: string;
  price_php: number;
  rated_w: number;
  running_w: number;
  peak_w: number;
  /** null in runtime mode: no hours, so no energy need. */
  energy_wh: number | null;
  usable_wh: number;
  runtime_h: number;
  eligible: boolean;
  reasons: string[];
};

export const STATIONS: Station[] = raw as Station[];

const r2 = (x: number) => Math.round((x + 1e-9) * 100) / 100;

export function evaluateStation(loads: Load[], s: Station): StationResult {
  const running = loads.reduce((t, l) => t + l.running_w * l.qty, 0) + s.self_consumption_w;

  // Only one unit starts at a time: the load with the largest start-up jump.
  let peak = running;
  let jump = -Infinity;
  for (const l of loads) {
    if (l.surge_w !== null && l.surge_w - l.running_w > jump) {
      jump = l.surge_w - l.running_w;
      peak = running - l.running_w + l.surge_w;
    }
  }

  const timed = loads.every((l) => l.hours !== null);
  const maxHours = timed ? Math.max(...loads.map((l) => l.hours!)) : 0;
  const energy = timed
    ? loads.reduce((t, l) => t + l.running_w * l.qty * l.hours!, 0) + s.self_consumption_w * maxHours
    : null;
  const usable = s.capacity_wh * DOD * INVERTER_EFFICIENCY;

  const reasons: string[] = [];
  if (s.rated_w < running * HEADROOM)
    reasons.push(`running ${r2(running)} W x 1.2 = ${r2(running * HEADROOM)} W > rated ${s.rated_w} W`);
  if (s.rated_w < peak) reasons.push(`peak ${r2(peak)} W > rated ${s.rated_w} W`);
  if (energy !== null && usable < energy) reasons.push(`usable ${r2(usable)} Wh < needed ${r2(energy)} Wh`);

  return {
    code: s.code,
    model: s.model,
    price_php: s.price_php,
    rated_w: s.rated_w,
    running_w: r2(running),
    peak_w: r2(peak),
    energy_wh: energy === null ? null : r2(energy),
    usable_wh: r2(usable),
    runtime_h: r2(usable / running),
    eligible: reasons.length === 0,
    reasons,
  };
}

export type Recommendation = {
  /** sizing: every load has hours. runtime: at least one load has no hours, so only watts are checked. */
  mode: 'sizing' | 'runtime';
  /** Stations that meet the full need, cheapest first. Always empty in runtime mode. */
  eligible: StationResult[];
  /**
   * Stations that can start and run the load but are judged on runtime, longest first.
   * runtime mode: every station that passes the watt checks.
   * sizing mode: filled only when eligible is empty, with the stations that fail on energy alone.
   */
  runtime: StationResult[];
  rejected: StationResult[];
  /** What the reply must say, for the runtime list. Absent when eligible holds the answer. */
  note?: string;
};

const NOTES = {
  runtime:
    'No hours were given. Give the runtime_h of each station in runtime, in this order. ' +
    'Then ask for the hours of use per day. Do not call showProducts: the card shows the stations and prices.',
  fallback:
    'No station covers all the hours. Do not say that no station can power the load. Give the runtime_h ' +
    'of each station in runtime, in this order. Do not call showProducts: the card shows the stations and prices.',
} as const;

const wattsOnly = (r: StationResult) => r.reasons.every((x) => x.startsWith('usable '));

/** codes: limit the stations to these (the customer named them). Unknown codes throw. */
export function recommendPowerStation(loads: Load[], codes?: string[]): Recommendation {
  if (loads.length === 0) throw new Error('recommendPowerStation needs at least one load');
  let pool = STATIONS;
  if (codes?.length) {
    const unknown = codes.filter((c) => !STATIONS.some((s) => s.code === c));
    if (unknown.length) throw new Error(`not a power station on file: ${unknown.join(', ')}`);
    pool = STATIONS.filter((s) => codes.includes(s.code));
  }
  const all = pool.map((s) => evaluateStation(loads, s));
  const mode = loads.every((l) => l.hours !== null) ? 'sizing' : 'runtime';
  const eligible = all
    .filter((r) => r.eligible && mode === 'sizing')
    .sort((a, b) => a.price_php - b.price_php || b.rated_w - b.peak_w - (a.rated_w - a.peak_w));
  const runtime =
    mode === 'runtime' || eligible.length === 0
      ? all.filter(wattsOnly).sort((a, b) => b.runtime_h - a.runtime_h)
      : [];
  const listed = new Set([...eligible, ...runtime]);
  const rejected = all.filter((r) => !listed.has(r)).sort((a, b) => a.price_php - b.price_php);
  const note = runtime.length === 0 ? undefined : mode === 'runtime' ? NOTES.runtime : NOTES.fallback;
  return { mode, eligible, runtime, rejected, ...(note ? { note } : {}) };
}

/** One row of the wattage table as a load. Throws if the table loses the row. */
function tableLoad(appliance: string, variant: string, qty: number, hours: number): Load {
  const a = APPLIANCES.find((x) => x.appliance === appliance && x.variant === variant);
  if (!a) throw new Error(`wattage table has no row ${appliance} / ${variant}`);
  return { name: `${a.appliance} ${a.variant}`, running_w: a.running_w, surge_w: a.surge_w, qty, hours };
}

/** The default sample day for a station comparison: a small household, wattages from the table. */
export function sampleLoads(): Load[] {
  return [
    tableLoad('Refrigerator', '8-cu-ft non-inverter', 1, 24),
    tableLoad('Television', '32" LED', 1, 5),
    tableLoad('Electric fan', '14-inch standard', 1, 8),
    tableLoad('Lights (LED equivalents)', 'LED Light Bulb (60W eq.)', 3, 6),
  ];
}

export type SampleDay = { source: 'session' | 'sample'; loads: Load[]; stations: StationResult[] };

/**
 * Each compared station on one day of loads: the customer's loads from this
 * session if there are any, else sampleLoads(). null when a code is not a
 * power station, so a comparison of other products gets no sample day.
 */
export function sampleDay(codes: string[], sessionLoads: Load[] | null): SampleDay | null {
  const stations = codes.map((c) => STATIONS.find((s) => s.code === c));
  if (stations.length === 0 || stations.some((s) => !s)) return null;
  const own = sessionLoads !== null && sessionLoads.length > 0;
  const loads = own ? sessionLoads : sampleLoads();
  return { source: own ? 'session' : 'sample', loads, stations: stations.map((s) => evaluateStation(loads, s!)) };
}
