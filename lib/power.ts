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

export const DOD = 0.9;
export const INVERTER_EFFICIENCY = 0.85;
export const HEADROOM = 1.2;

export type Load = { name: string; running_w: number; surge_w: number | null; qty: number; hours: number };

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
  energy_wh: number;
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

  const maxHours = Math.max(...loads.map((l) => l.hours));
  const energy = loads.reduce((t, l) => t + l.running_w * l.qty * l.hours, 0) + s.self_consumption_w * maxHours;
  const usable = s.capacity_wh * DOD * INVERTER_EFFICIENCY;

  const reasons: string[] = [];
  if (s.rated_w < running * HEADROOM)
    reasons.push(`running ${r2(running)} W x 1.2 = ${r2(running * HEADROOM)} W > rated ${s.rated_w} W`);
  if (s.rated_w < peak) reasons.push(`peak ${r2(peak)} W > rated ${s.rated_w} W`);
  if (usable < energy) reasons.push(`usable ${r2(usable)} Wh < needed ${r2(energy)} Wh`);

  return {
    code: s.code,
    model: s.model,
    price_php: s.price_php,
    rated_w: s.rated_w,
    running_w: r2(running),
    peak_w: r2(peak),
    energy_wh: r2(energy),
    usable_wh: r2(usable),
    runtime_h: r2(usable / running),
    eligible: reasons.length === 0,
    reasons,
  };
}

export function recommendPowerStation(loads: Load[]): { eligible: StationResult[]; rejected: StationResult[] } {
  if (loads.length === 0) throw new Error('recommendPowerStation needs at least one load');
  const all = STATIONS.map((s) => evaluateStation(loads, s));
  const eligible = all
    .filter((r) => r.eligible)
    .sort((a, b) => a.price_php - b.price_php || b.rated_w - b.peak_w - (a.rated_w - a.peak_w));
  const rejected = all.filter((r) => !r.eligible).sort((a, b) => a.price_php - b.price_php);
  return { eligible, rejected };
}
