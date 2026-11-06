import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupApplianceWattage, checklistFor, USER_TYPES } from '@/lib/appliances';

function found(q: string) {
  const r = lookupApplianceWattage(q);
  assert.equal(r.status, 'found', `"${q}" should be found`);
  return r.status === 'found' ? r.matches : [];
}

test('maps ref to Refrigerator', () => {
  const m = found('ref');
  assert.ok(m.length > 0);
  assert.ok(m.every((a) => a.appliance === 'Refrigerator'));
});

test('maps aircon 1hp to both 1.0 HP variants', () => {
  const m = found('aircon 1hp');
  assert.deepEqual(m.map((a) => a.variant).sort(), ['1.0 HP inverter', '1.0 HP non-inverter']);
  assert.equal(m.find((a) => a.variant === '1.0 HP non-inverter')!.surge_w, 1800);
});

test('electric fan returns both fan variants', () => {
  const m = found('electric fan');
  assert.equal(m.length, 2);
  assert.ok(m.every((a) => a.appliance === 'Electric fan'));
});

test('suggests the highest-wattage variant of one appliance', () => {
  const r = lookupApplianceWattage('electric fan');
  assert.equal(r.status === 'found' && r.suggested?.running_w, 60);
  const ac = lookupApplianceWattage('aircon 1hp');
  assert.deepEqual(ac.status === 'found' && ac.suggested, {
    name: 'Air Conditioner 1.0 HP non-inverter',
    running_w: 1300,
    surge_w: 1800,
  });
  const fan = lookupApplianceWattage('fan'); // ceiling, electric, heater...: no single appliance
  assert.equal(fan.status === 'found' && fan.suggested, undefined);
});

test('chest freezer is found', () => {
  const m = found('chest freezer');
  assert.ok(m.some((a) => /chest/i.test(a.variant)));
});

test('flux capacitor returns unknown', () => {
  assert.deepEqual(lookupApplianceWattage('flux capacitor'), { status: 'unknown', query: 'flux capacitor' });
});

test('size words narrow the variant', () => {
  assert.deepEqual(found('16 cu ft ref').map((a) => a.variant), ['16 cu. ft. (AC)']);
  assert.deepEqual(found('32-inch TV').map((a) => a.variant).sort(), ['32" LCD', '32" LED']);
  assert.equal(found('bentilador')[0].appliance, 'Electric fan');
});

test('checklistFor Residential lists only Residential items', () => {
  const list = checklistFor('Residential');
  assert.ok(list.length > 0);
  assert.ok(list.every((a) => a.user_types.includes('Residential')));
  assert.deepEqual(checklistFor('Spaceship'), []);
  assert.ok(USER_TYPES.includes('Residential'));
});

test('an unmatched variant is flagged as not exact', () => {
  const r = lookupApplianceWattage('1hp ref');
  assert.equal(r.status, 'found');
  if (r.status !== 'found') return;
  assert.equal(r.exact, false);
  assert.equal(r.asked, '1hp ref');
  assert.equal(r.suggested?.name, 'Refrigerator 8-cu-ft non-inverter');
  const ok = lookupApplianceWattage('16 cu ft ref');
  assert.equal(ok.status === 'found' && ok.exact, true);
});
