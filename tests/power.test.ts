/**
 * Power-station sizing (PRD F4). The first five cases are worked by hand in
 * docs/plan.md, M3. The other ten come from docs/evidence/calculator-cases.md,
 * which scripts/calc_cases.py computes without this module.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATIONS, evaluateStation, recommendPowerStation, sampleDay, sampleLoads, type Load } from '@/lib/power';

const L = (name: string, running_w: number, qty: number, hours: number | null, surge_w: number | null = null): Load => ({
  name,
  running_w,
  surge_w,
  qty,
  hours,
});
const station = (code: string) => {
  const s = STATIONS.find((x) => x.code === code);
  if (!s) throw new Error(`no station ${code}`);
  return s;
};
const codes = (r: { code: string }[]) => r.map((x) => x.code);
const AIRCON = (h: number) => L('Air Conditioner 1.0 HP non-inverter', 1300, 1, h, 1800);

test('STATIONS holds the 10 on-sale stations', () => {
  assert.equal(STATIONS.length, 10);
  for (const s of STATIONS) assert.equal(typeof s.price_php, 'number');
});

// ---- the five cases from the plan ----

test('workbook check', () => {
  const r = evaluateStation([L('Fridge', 150, 1, 1)], station('PWR-002-01'));
  assert.equal(r.running_w, 170);
  assert.equal(r.usable_wh, 2114.46);
  assert.equal(r.runtime_h, 12.44);
});

test('small laptop load', () => {
  const { eligible } = recommendPowerStation([L('Laptop', 45, 1, 3)]);
  const first = eligible[0];
  assert.equal(first.code, 'PWR-001-01');
  assert.equal(first.price_php, 13209);
  assert.equal(first.running_w, 57);
  assert.equal(first.energy_wh, 171);
  assert.equal(first.usable_wh, 175.95);
  assert.equal(first.runtime_h, 3.09);
});

test('brownout night', () => {
  const { eligible, rejected } = recommendPowerStation([
    L('32" LED TV', 30, 1, 8),
    L('14" fan', 60, 2, 8),
    L('16 cu ft fridge', 100, 1, 8),
  ]);
  assert.deepEqual(codes(eligible), ['PWR-002-02']);
  assert.equal(eligible[0].price_php, 100900);
  assert.equal(eligible[0].energy_wh, 2080);
  assert.equal(eligible[0].usable_wh, 2448);
  assert.equal(eligible[0].runtime_h, 9.42);
  const apex = rejected.find((r) => r.code === 'PWR-002-01')!;
  assert.deepEqual(apex.reasons, ['usable 2114.46 Wh < needed 2160 Wh']);
});

test('aircon one hour', () => {
  const { eligible, rejected } = recommendPowerStation([AIRCON(1)]);
  assert.deepEqual(codes(eligible), ['PWR-001-08', 'PWR-001-07', 'PWR-002-01']);
  const elite = rejected.find((r) => r.code === 'PWR-002-02')!;
  assert.deepEqual(elite.reasons, ['peak 1810 W > rated 1800 W']);
  const p150 = rejected.find((r) => r.code === 'PWR-001-06')!;
  assert.ok(p150.reasons.includes('peak 1815 W > rated 1800 W'));
  assert.ok(p150.reasons.some((x) => x.startsWith('usable ')));
});

test('aircon four hours', () => {
  const { eligible, runtime, rejected } = recommendPowerStation([AIRCON(4)]);
  assert.deepEqual(eligible, []);
  // No station holds 4 h, so the ones that can start it are listed by runtime.
  assert.deepEqual(codes(runtime), ['PWR-002-01', 'PWR-001-08', 'PWR-001-07', 'PWR-001-05']);
  assert.equal(runtime.length + rejected.length, 10);
});

// ---- the ten cases from docs/evidence/calculator-cases.md ----

type Case = {
  name: string;
  loads: Load[];
  order: string[];
  first?: { running_w: number; peak_w: number; energy_wh: number; usable_wh: number; runtime_h: number };
};

const CASES: Case[] = [
  {
    name: 'qty above 1',
    loads: [L('LED bulb', 10, 4, 7)],
    order: ['PWR-001-03', 'PWR-001-04', 'PWR-001-05', 'PWR-001-06', 'PWR-001-08', 'PWR-001-07', 'PWR-002-02', 'PWR-002-01'],
    first: { running_w: 50, peak_w: 50, energy_wh: 350, usable_wh: 385.56, runtime_h: 7.71 },
  },
  {
    name: 'mixed hours',
    loads: [L('Router', 10, 1, 12), L('Laptop', 60, 1, 4)],
    order: ['PWR-001-04', 'PWR-001-05', 'PWR-001-06', 'PWR-001-08', 'PWR-001-07', 'PWR-002-02', 'PWR-002-01'],
    first: { running_w: 85, peak_w: 85, energy_wh: 540, usable_wh: 660.96, runtime_h: 7.78 },
  },
  {
    name: 'exactly at rated / 1.2',
    loads: [L('Custom load', 238, 1, 0.5)],
    order: ['PWR-001-01', 'PWR-001-02', 'PWR-001-03', 'PWR-001-04', 'PWR-001-05', 'PWR-001-06', 'PWR-001-08', 'PWR-001-07', 'PWR-002-02', 'PWR-002-01'],
    first: { running_w: 250, peak_w: 250, energy_wh: 125, usable_wh: 175.95, runtime_h: 0.7 },
  },
  {
    name: 'one watt over rated / 1.2',
    loads: [L('Custom load', 239, 1, 0.5)],
    order: ['PWR-001-02', 'PWR-001-03', 'PWR-001-04', 'PWR-001-05', 'PWR-001-06', 'PWR-001-08', 'PWR-001-07', 'PWR-002-02', 'PWR-002-01'],
    first: { running_w: 246.5, peak_w: 246.5, energy_wh: 123.25, usable_wh: 244.8, runtime_h: 0.99 },
  },
  {
    name: 'microwave',
    loads: [L('Microwave', 900, 1, 0.5)],
    order: ['PWR-001-05', 'PWR-001-06', 'PWR-001-08', 'PWR-001-07', 'PWR-002-02', 'PWR-002-01'],
    first: { running_w: 910, peak_w: 910, energy_wh: 455, usable_wh: 783.36, runtime_h: 0.86 },
  },
  {
    name: '1 kW for an hour',
    loads: [L('Custom load', 1000, 1, 1)],
    order: ['PWR-001-06', 'PWR-001-08', 'PWR-001-07', 'PWR-002-02', 'PWR-002-01'],
    first: { running_w: 1015, peak_w: 1015, energy_wh: 1015, usable_wh: 1101.6, runtime_h: 1.09 },
  },
  {
    name: '1.2 kW for an hour',
    loads: [L('Custom load', 1200, 1, 1)],
    order: ['PWR-001-08', 'PWR-001-07', 'PWR-002-02', 'PWR-002-01'],
    first: { running_w: 1218, peak_w: 1218, energy_wh: 1218, usable_wh: 1762.56, runtime_h: 1.45 },
  },
  {
    name: '2.1 kW, half an hour',
    loads: [L('Custom load', 2100, 1, 0.5)],
    order: ['PWR-001-07', 'PWR-002-01'],
    first: { running_w: 2110, peak_w: 2110, energy_wh: 1055, usable_wh: 1586.3, runtime_h: 0.75 },
  },
  {
    name: 'small load, long night',
    loads: [L('Custom load', 150, 1, 14)],
    order: ['PWR-002-02'],
    first: { running_w: 160, peak_w: 160, energy_wh: 2240, usable_wh: 2448, runtime_h: 15.3 },
  },
  {
    name: '3 kW tool',
    loads: [L('Custom load', 3000, 1, 0.5)],
    order: ['PWR-002-01'],
    first: { running_w: 3020, peak_w: 3020, energy_wh: 1510, usable_wh: 2114.46, runtime_h: 0.7 },
  },
];

for (const c of CASES) {
  test(`case: ${c.name}`, () => {
    const { eligible } = recommendPowerStation(c.loads);
    assert.deepEqual(codes(eligible), c.order);
    if (c.first) {
      const f = eligible[0];
      assert.deepEqual(
        { running_w: f.running_w, peak_w: f.peak_w, energy_wh: f.energy_wh, usable_wh: f.usable_wh, runtime_h: f.runtime_h },
        c.first,
      );
    }
  });
}

test('one watt over rated / 1.2 names the headroom failure', () => {
  const r = evaluateStation([L('Custom load', 239, 1, 0.5)], station('PWR-001-01'));
  assert.equal(r.eligible, false);
  assert.deepEqual(r.reasons, ['running 251 W x 1.2 = 301.2 W > rated 300 W']);
});

// ---- runtime mode and fallback ----

const REF = (h: number | null) => L('Refrigerator 8-cu-ft non-inverter', 160, 1, h);

test('fridge 24 h: no station holds it, so every watt fit is listed by runtime', () => {
  const r = recommendPowerStation([REF(24)]);
  assert.equal(r.mode, 'sizing');
  assert.deepEqual(r.eligible, []);
  assert.equal(r.runtime.length, 10);
  assert.equal(r.runtime[0].code, 'PWR-002-02');
  for (let i = 1; i < r.runtime.length; i++) assert.ok(r.runtime[i - 1].runtime_h >= r.runtime[i].runtime_h);
});

test('no hours: runtime mode checks watts only', () => {
  const r = recommendPowerStation([REF(null)]);
  assert.equal(r.mode, 'runtime');
  assert.deepEqual(r.eligible, []);
  assert.equal(r.runtime.length, 10);
  assert.equal(r.runtime[0].energy_wh, null);
  const a = recommendPowerStation([{ ...AIRCON(1), hours: null }]);
  assert.ok(a.rejected.some((x) => x.code === 'PWR-002-02'), 'ELITE320 fails the start-up peak');
});

test('sizing with a fit leaves runtime empty', () => {
  const r = recommendPowerStation([L('Laptop', 45, 1, 3)]);
  assert.equal(r.eligible[0].code, 'PWR-001-01');
  assert.deepEqual(r.runtime, []);
});

test('codes limit the stations', () => {
  const r = recommendPowerStation([REF(null)], ['PWR-001-06', 'PWR-001-05']);
  assert.deepEqual(codes(r.runtime), ['PWR-001-06', 'PWR-001-05']);
  assert.throws(() => recommendPowerStation([REF(1)], ['PPE-001']), /not a power station/);
});

test('sampleDay: default household loads, or the session loads', () => {
  const d = sampleDay(['PWR-001-06', 'PWR-001-05'], null)!;
  assert.equal(d.source, 'sample');
  assert.deepEqual(d.loads, sampleLoads());
  assert.deepEqual(codes(d.stations), ['PWR-001-06', 'PWR-001-05']);
  assert.ok(d.stations[0].runtime_h > d.stations[1].runtime_h, 'the 1440 Wh station runs longer');
  const own = sampleDay(['PWR-001-06', 'PWR-001-05'], [REF(null)])!;
  assert.equal(own.source, 'session');
  assert.equal(sampleDay(['PWR-001-06', 'PPE-001'], null), null);
});
